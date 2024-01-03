// todo: compile evaltail only if necessary
// todo: interpreter -- return new Tail and use evaltail only if necessary

// ?todo: runtime env could have simpler bindings -- no need to keep track of let and const
class Env {
  bindings = new Map()
  constructor(parent, bindings) {
    this.parent = parent
    if (bindings instanceof Map) {
      this.bindings = bindings
    }
  }
  lookupenv(key) {
    let env = this
    while (env.bindings.has(key) === false) {
      if (env.parent === null) return undefined
      env = env.parent
    }
    return env
  }
  lookup(key) {
    let env = this
    while (env.bindings.has(key) === false) {
      if (env.parent === null) return undefined
      env = env.parent
    }
    return env.bindings.get(key)
  }
}

class Aenv extends Env {
  constructor(parent, bindings, type = 'normal', top = null) {
    super(parent, bindings)
    this.type = type
    // hacky
    this.top = top ?? parent.top
  }
  defer(fn) {
    this.top.deferred.push(fn)
  }
  // if this aenv has a parent which is a fn, returns the parent of that fn
  // this is used to perform deferred checks for undefined variables to enable [mutually] recursive functions
  getDeferParent() {
    if (this.parent === null) return null
    if (this.type === 'fn') return this.parent
    return this.parent.getDeferParent()
  }
}

class Tail {
  constructor(body, localenv) {
    this.body = body
    this.localenv = localenv
  }
}

const abinding = (name, value, type = 'afn') => [name, {
  binding: 'const',
  value,
  type
}]

const abind = (type) => (jevko, aenv) => {
  const {subs} = jevko
  const {length} = subs

  // note: could also allow an "else" clause -- a value to return from let that is not bound to anything
  if (length < 2 || length % 2 !== 0) throw Error(`${type} arity error!`)

  const bs = []
  const compiles = []
  for (let i = 0; i < length; i += 2) {
    const name = subtoname(subs[i])

    if (aenv.bindings.has(name)) throw Error(`${type} can't redeclare variable: ${name}`)
    
    const value = analyzesub(subs[i + 1], aenv)
    
    aenv.bindings.set(name, {
      binding: type,
      ...value,
    })

    bs.push([name, value.eval])
    compiles.push([name, value.compile])
  }

  return {
    type: 'decl',
    eval: env => {
      let v
      for (const [name, value] of bs) {
        v = evaltail(value(env))
        env.bindings.set(name, {value: v})
      }
      // return last value
      return v
    },
    compile: cenv => {
      let ret = ''
      for (const [name, value] of compiles) {
        ret += `${type} ${name} = evaltail(${value(cenv)})\n`
      }
      return ret
    }
  }
}

const topaenv = new Aenv(null, null, 'top', 'hack')
topaenv.bindings = new Map([
  abinding('true', true, 'const'),
  abinding('false', false, 'const'),
  abinding('list', (jevko, aenv) => {
    const {compiles, evals} = analyzeargs2(jevko, aenv)

    return {
      eval: (env) => {
        return evals.map(e => evaltail(e(env)))
      },
      compile: (cenv) => {
        return `[${compiles.map(c => `evaltail(${c(cenv)})`).join(',')}]`
      }
    }
  }),
  abinding('fn', (jevko, aenv) => {
    const {subs, suffix} = jevko
    const params = []
    let body, compilebody
    const localaenv = new Aenv(aenv, null, 'fn')
    if (subs.length === 0) {
      // no params, body is {prefix: '', jevko}
      // body = {prefix: '', jevko}
      const analyzed = analyzesuf(suffix, localaenv)
      body = analyzed.eval
      compilebody = analyzed.compile
    }
    else if (subs.length === 1) {
      // no params, body is subs[0]
      // body = subs[0]
      const analyzed = analyzesub(subs[0], localaenv)
      body = analyzed.eval
      compilebody = analyzed.compile
    }
    else {
      {
        // todo:
        const {jevko} = subs[0]
        const {subs: ss, suffix} = jevko
        // for now support only named params, no ..., etc.
        if (ss.length === 0) {
          params.push(suffix)
          // bind argument:
          localaenv.bindings.set(suffix, '*unbound*')
        }
        else for (const {prefix, jevko: {subs, suffix}} of ss) {
          // todo
          if (prefix !== '') throw Error('oops')
          if (subs.length > 0) throw Error('oops')
          // todo: validate suffix as id
          if (params.includes(suffix)) throw Error('oops')
          params.push(suffix)
          // bind argument:
          localaenv.bindings.set(suffix, '*unbound*')
        }
      }
      
      const analyzed = subs.length === 2? 
        analyzesub(subs[1], localaenv): 
        analyzesubs(subs.slice(1), localaenv)
        
      body = analyzed.eval
      compilebody = analyzed.compile
      
      // {prefix: '', jevko: {subs: subs.slice(1), suffix: ''}}
    }
    // return new Fn(params, body, aenv)

    // todo: could ~return a fn object into aenv which will contain info about arity, so it can be checked at callsites
    
    return {
      type: 'fn',
      params,
      eval: (fnenv) => {
        // return Fn(params, body, fnenv)

        return (argfns, env) => {
          const argvals = argfnstoargs(argfns, env)
          // let's assume body is a single sub
          // const {params, body, fnenv} = fn
          // todo: move this check to static
          if (params.length !== argvals.length) {
            throw Error(`Arity error! Expected ${params.length}, got ${argvals.length}!`)
          }
          const args = bindparams(params, argvals)
          const localenv = new Env(fnenv, args)

          // todo: return new Tail only if body may continue indefinitely
          return new Tail(body, localenv)
        }
      },
      compile: (cenv) => {
        // todo: return new Tail only if body may continue indefinitely
        return `(${params.join(',')}) => {return new Tail(()=>${compilebody(cenv)})}`
      }
    }
  }),
  abinding('jsfn', (jevko, aenv) => {
    const {subs, suffix} = jevko
    const params = []
    let body, compilebody
    const localaenv = new Aenv(aenv, null, 'fn')
    if (subs.length === 0) {
      // no params, body is {prefix: '', jevko}
      // body = {prefix: '', jevko}
      const analyzed = analyzesuf(suffix, localaenv)
      body = analyzed.eval
      compilebody = analyzed.compile
    }
    else if (subs.length === 1) {
      // no params, body is subs[0]
      // body = subs[0]
      const analyzed = analyzesub(subs[0], localaenv)
      body = analyzed.eval
      compilebody = analyzed.compile
    }
    else {
      {
        // todo:
        const {jevko} = subs[0]
        const {subs: ss, suffix} = jevko
        // for now support only named params, no ..., etc.
        if (ss.length === 0) {
          params.push(suffix)
          // bind argument:
          localaenv.bindings.set(suffix, '*unbound*')
        }
        else for (const {prefix, jevko: {subs, suffix}} of ss) {
          // todo
          if (prefix !== '') throw Error('oops')
          if (subs.length > 0) throw Error('oops')
          // todo: validate suffix as id
          if (params.includes(suffix)) throw Error('oops')
          params.push(suffix)
          // bind argument:
          localaenv.bindings.set(suffix, '*unbound*')
        }
      }
      
      const analyzed = subs.length === 2? 
        analyzesub(subs[1], localaenv): 
        analyzesubs(subs.slice(1), localaenv)
        
      body = analyzed.eval
      compilebody = analyzed.compile
      
      // {prefix: '', jevko: {subs: subs.slice(1), suffix: ''}}
    }
    // return new Fn(params, body, aenv)

    // todo: could ~return a fn object into aenv which will contain info about arity, so it can be checked at callsites
    
    return {
      type: 'fn',
      params,
      eval: (fnenv) => {
        // return Fn(params, body, fnenv)

        return (argfns, env) => {
          const argvals = argfnstoargs(argfns, env)
          // let's assume body is a single sub
          // const {params, body, fnenv} = fn
          // todo: move this check to static
          if (params.length !== argvals.length) {
            throw Error(`Arity error! Expected ${params.length}, got ${argvals.length}!`)
          }
          const args = bindparams(params, argvals)
          const localenv = new Env(fnenv, args)

          // todo: return new Tail only if body may continue indefinitely
          return new Tail(body, localenv)
        }
      },
      compile: (cenv) => {
        // todo: return new Tail only if body may continue indefinitely
        return `(${params.join(',')}) => {return ${compilebody(cenv)}}`
      }
    }
  }),
  abinding('const', abind('const')),
  abinding('let', abind('let')),
  abinding('set!', (jevko, aenv) => {
    const {subs} = jevko
    if (subs.length !== 2) throw Error(`set! arity error!`)
    const name = subtoname(subs[0])
    const value = analyzesub(subs[1], aenv)
    const evalvalue = value.eval
    const compilevalue = value.compile

    const e = aenv.lookupenv(name)

    if (e === undefined) throw Error(`set! unknown variable: ${name}`)

    const binding = e.bindings.get(name)

    if (binding.binding !== 'let') throw Error(`set! can't change variable: ${name}`)

    return {
      eval: env => {
        const e = env.lookupenv(name)
        const binding = e.bindings.get(name)
        binding.value = evaltail(evalvalue(env))
        return evalvalue
      },
      compile: cenv => {
        return `${name} = evaltail(${compilevalue(cenv)})`
      }
    }
  }),
  abinding('?', (jevko, aenv) => {
    const {subs, suffix} = jevko
    if (subs.length < 2) throw Error('? arity error!')
    const hasalt = subs.length % 2 === 1
    const boundary = hasalt? subs.length - 1: subs.length
    const evals = []
    const compiles = []
    for (let i = 0; i < boundary; i += 2) {
      const condval = analyzesub(subs[i], aenv)
      const conseqval = analyzesub(subs[i + 1], aenv)
      // console.log('ssss', subs.length, i + 1, subs[i + 1])
      evals.push([condval.eval, conseqval.eval])
      compiles.push([condval.compile, conseqval.compile])
    }
    let alteval, altcompile
    if (hasalt) {
      const alt = analyzesub(subs.at(-1), aenv)
      alteval = alt.eval
      altcompile = alt.compile
    }
    // note: let's say ? w/o alt returns ''
    // note: could optimize this by generating a version which returns '' instead of new Tail after for
    else {
      alteval = env => ''
      altcompile = cenv => '""'
    }

    return {
      eval: env => {
        for (const [condf, conseqf] of evals) {
          if (condf(env)) return new Tail(conseqf, env)
        }
        return new Tail(alteval, env)
      },
      compile: (cenv) => {
        let ret = '(()=>{'
        for (const [condf, conseqf] of compiles) {
          ret += `if (${condf(cenv)}) {return new Tail(()=>${conseqf(cenv)})}\nelse `
        }
        return ret + `{return new Tail(()=>${altcompile(cenv)})}})()`
      }
    }
  }),
  abinding('', (jevko, aenv) => {
    const {subs, suffix} = jevko
    if (subs.length === 0) return analyzesuf(suffix, aenv)
    return analyzesubs(subs, aenv)
  }),
  // todo:
  ['log', '*todo*'],
  abinding('=', (jevko, aenv) => {
    const {evals: argfns, compiles} = analyzeargs2(jevko, aenv)
    if (argfns.length !== 2) throw Error('= arity')
    // todo: static type checking?
    // would verify here that args are numbers
    // aenv would contain type info
    return {
      eval: (env) => {
        const vals = argfnstoargs(argfns, env)
        return vals[0] === vals[1]
      },
      compile: cenv => {
        return `${compiles[0](cenv)} === ${compiles[1](cenv)}`
      }
    }
  }),
  abinding('-', (jevko, aenv) => {
    const {evals: argfns, compiles} = analyzeargs2(jevko, aenv)
    if (argfns.length !== 2) throw Error('- arity')
    // todo: static type checking?
    // would verify here that args are numbers
    // aenv would contain type info
    return {
      eval: (env) => {
        const vals = argfnstoargs(argfns, env)
        return vals[0] - vals[1]
      },
      compile: cenv => {
        return `${compiles[0](cenv)} - ${compiles[1](cenv)}`
      }
    }
  }),
  // note: + optimized at analyze-time
  abinding('+', (jevko, aenv) => {
    const {evals: argfns, compiles} = analyzeargs2(jevko, aenv)
    if (argfns.length !== 2) throw Error('+ arity')
    // todo: static type checking?
    // would verify here that args are numbers
    // aenv would contain type info
    return {
      eval: (env) => {
        const vals = argfnstoargs(argfns, env)
        return vals[0] + vals[1]
      },
      compile: cenv => {
        return `${compiles[0](cenv)} + ${compiles[1](cenv)}`
      }
    }
  }),
  // ['', '*unbound*'],
])

const subtoname = (sub) => {
  const {prefix, jevko} = sub
  console.assert(prefix === '')
  const {subs, suffix} = jevko
  console.assert(subs.length === 0)
  // todo: check if suffix not a number, string, etc.
  return suffix
}

const analyzesub = (sub, aenv) => {
  const {prefix, jevko} = sub

  if (prefix === '.') {
    // we're doing $at[suffix]

    const {subs, suffix} = jevko

    // assuming we can only do single-argument indexing
    if (subs.length !== 0) throw Error('oops')
    // todo: allow only strings or numbers;
    // future: may allow ranges and other types

    const asuf = analyzesuf(suffix, aenv)
    const evalsuf = asuf.eval

    return {
      eval: (env) => {
        // note: this relies on @ always being in immediate scope to work correctly
        // todo: tighten the edge case at the beginning of a block (and by extension at the beginning of the program)
        const at = env.lookup('@')
        // return at[evalsuf(env)]
        let ret = at[evalsuf(env)]
        if (typeof ret === 'function') ret = ret.bind(at)
        return ret
      },
      compile: (cenv) => {
        // return `${encodedAt}[evaltail(${asuf.compile(cenv)})]`
        return `(()=>{
          let $ = ${encodedAt}[evaltail(${asuf.compile(cenv)})]
          if (typeof $ === 'function') $ = $.bind(${encodedAt})
          return $
        })()`
      },
    }
  }
  else if (prefix.startsWith('.')) {
    const name = prefix.slice(1).trim()
    // todo: analyze args
    const {evals, compiles} = analyzeargs2(jevko, aenv)

    // todo: like above, if returning a fn, bind it to @ first
    return {
      eval: (env) => {
        // note: this relies on @ always being in immediate scope to work correctly
        // todo: tighten the edge case at the beginning of a block (and by extension at the beginning of the program)
        const at = env.lookup('@')
        const args = evals.map(ae => ae(env))
        return at[name](...args)
      },
      compile: (cenv) => {
        // todo: evaltail only if necessary
        const compiledargs = compiles.map(a => `evaltail(${a(cenv)})`)
        return `${encodedAt}.${encodeid(name)}(${compiledargs.join(',')})`
      },
    }
  }

  // todo: validate prefix

  const found = aenv.lookup(prefix)

  if (found === undefined) {
    // checking for unknown variables at analysis-time that allows for [mutually] recursive functions by deferring the checks to the last stage of analysis

    const paenv = aenv.getDeferParent()
    if (paenv !== null) {
      paenv.defer(() => {
        const e = paenv.lookupenv(prefix)

        if (e === undefined) {
          throw Error(`Unknown name: '${prefix}'`)
        }

        console.log(`Not sure if available at runtime: '${prefix}'`)
        // if (e === aenv) throw Error(`Can't use before declaration: '${prefix}'`)
        // todo: e must be outside of the fn that contains aenv

        // also the fn that contains aenv must not be invoked before prefix is defined/created
        // BUT: pretty sure that is IN GENERAL impossible to verify without running the program
        // so to be correct we should return a special runtime fn that does the check also in runtime
        // and we should warn that we're not sure if this is defined at runtime or not (show our reasoning that leads to us believing that it MAY be defined)
        
        // todo: check arity, etc.
        const found = e.bindings.get(prefix)

        if (found.type === 'fn') {
          const {params} = found
      
          if (params.length !== argfns.length) {
            throw Error('arity error')
          }
        }
      })

      const {evals: argfns, compiles} = analyzeargs2(jevko, aenv)
      return {
        eval: env => {
          const found = env.lookup(prefix)

          if (found === undefined) {
            throw Error(`Unknown name: '${prefix}'`)
          }

          const {value} = found

          // todo: either distinguish native javascript fns and jezyk fns or make jezyk fns strict
          return value(argfns, env)
        },
        compile: cenv => {
          return `${encodeid(prefix)}(${compiles.map(c => `evaltail(${c(cenv)})`).join(',')})\n`
        }
      }
    }
    else {
      throw Error(`Unknown name: '${prefix}'`)
    }
  }

  const {value, type} = found
  if (type === 'afn') {
    // note: break down a static construct
    return value(jevko, aenv)
  }

  const {evals: argfns, compiles} = analyzeargs2(jevko, aenv)
  if (type === 'fn') {
    const {params} = found

    if (params.length !== argfns.length) {
      throw Error('arity error')
    }
  }

  // todo: check arity, etc.
  return {
    eval: env => {
      const found = env.lookup(prefix)

      const {value} = found

      // todo: either distinguish native javascript fns and jezyk fns or make jezyk fns strict
      return value(argfns, env)
    },
    compile: cenv => {
      // todo: evaltail only if necessary
      return `${encodeid(prefix)}(${compiles.map(c => `evaltail(${c(cenv)})`).join(',')})\n`
    }
  }
}

// todo: rename
const analyzeargs2 = (jevko, aenv) => {
  const evals = []
  const compiles = []
  const {subs, suffix} = jevko
  if (subs.length === 0) {
    // note: empty suffix means fn invoked with 0 args
    if (suffix !== '') {
      const a = analyzesuf(suffix, aenv)
      evals.push(a.eval)
      compiles.push(a.compile)
    }
  } else {
    for (const sub of subs) {
      const a = analyzesub(sub, aenv)
      evals.push(a.eval)
      compiles.push(a.compile)
    }
  }
  return {evals, compiles}
}

/**
 * checks if str looks like a number
 * allows _ and space as digit separators
 * assumes str trimmed
 * @param {string} str 
 * @returns 
 */
const matchnum = (str) => {
  if (str === 'NaN') return true
  if (str.matchAll(/0[bB][01]([_ ]?[01])*/g).next().done === false) return true
  if (str.matchAll(/0[oO][0-7]([_ ]?[0-7])*/g).next().done === false) return true
  if (str.matchAll(/0[xX][0-9a-fA-F]([_ ]?[0-9a-fA-F])*/g).next().done === false) return true
  if (str.matchAll(/[+-]?(Infinity|((0|[1-9]([_ ]?[0-9])*)(\.[0-9]([_ ]?[0-9])*)?([eE][+-]?[0-9]([_ ]?[0-9])*)?))/g).next().done === false) return true
  return false
}

const analyzesuf = (suf, aenv) => {
  // let's say for now:
  if (suf === '') return {
    eval: env => '',
    compile: env => '""',
  }
  if (suf.startsWith("'")) {
    if (suf.endsWith("'")) return {
      eval: env => suf.slice(1, -1),
      compile: cenv => JSON.stringify(suf.slice(1, -1)),
    }
    return {
      eval: env => suf.slice(1),
      compile: cenv => JSON.stringify(suf.slice(1)),
    }
  }
  if (suf === 'NaN') return {
    eval: env => NaN,
    compile: cenv => 'NaN',
  }
  if (matchnum(suf)) {
    const num = Number(suf.replaceAll(/ |_/g, ''))
    if (Number.isNaN(num) === false) return {
      eval: env => num,
      compile: cenv => suf.replaceAll(/ |_/g, ''),
    }
    throw Error('got a bug')
  }

  // todo: validate suf as identifier 

  // note: looking up in compile/analyze-time environment
  const found = aenv.lookup(suf)

  // note: analysis/compile-time checking of unbound variables
  //   aenv must keep track of local bindings
  if (found === undefined) {
    // defer allows for [mutually] recursive functions
    const paenv = aenv.getDeferParent()
    if (paenv !== null) {
      paenv.defer(() => {
        const e = paenv.lookupenv(suf)

        if (e === undefined) {
          throw Error(`Unbound variable: ${suf}`)
        }

        console.log(`Not sure if available at runtime: '${suf}'`)
        const found = e.bindings.get(suf)
        // todo: analyze `found` further
      })
      // must do a runtime check, because the variable might be falsely identified as defined at analysis-time
      return {
        eval: env => {
          const found = env.lookup(suf)
          if (found === undefined) {
            throw Error(`Unbound variable: ${suf}`)
          }
          const {value} = found
          return value 
        },
        compile: cenv => {
          return suf
        }
      }
    }
    else {
      console.error(aenv)
      throw Error(`Unbound variable: ${suf}`)
    }
  }
  
  const {value, type} = found
  // compile-time constants:
  if (type === 'const') return {
    eval: env => value,
    compile: cenv => value.toString()
  }
  // ?todo: could support CTFE
  // todo: analyze `found` further

  // runtime value:
  return {
    eval: env => {
      const {value} = env.lookup(suf)
      return value 
    },
    compile: cenv => {
      return encodeid(suf)
    }
  }
}

export const encodeid = (id) => {
  id = id.trim()
  if (id === '') throw Error()
  const iterator = id[Symbol.iterator]()
  // const codepoints = [...id]
  let ret = ''
  {
    /** @type {string} */
    const c = iterator.next().value
    // a-zA-Z$_
    if ([...c.matchAll(/[a-zA-Z_]/g)].length === 0) {
      ret += '$' + c.codePointAt(0).toString(36) + '$'
    }
    else ret += c
  }
  for (const c of iterator) {
    // const c = id[i]
    if ([...c.matchAll(/[a-zA-Z0-9_]/g)].length === 0) {
      ret += '$' + c.codePointAt(0).toString(36) + '$'
    }
    else ret += c
  }
  return ret
}

const encodedAt = encodeid('@')
const analyzesubs = (subs, aenv) => {
  const localaenv = new Aenv(aenv, null, 'block')
  const analyzed = []
  const as = []

  // todo:
  localaenv.bindings.set('@', '*unbound*')
  for (const sub of subs) {
    const a = analyzesub(sub, localaenv)
    localaenv.bindings.set('@', a)
    analyzed.push(a.eval)
    as.push(a)
  }

  return {
    eval: env => {
      const localenv = new Env(env)
      let v
      // todo:
      localenv.bindings.set('@', {value: undefined})
      for (let i = 0; i < analyzed.length - 1; ++i) {
        const sub = analyzed[i]
        v = evaltail(sub(localenv))
        localenv.bindings.set('@', {value: v})
      }
      // console.log('>>>', subs.at(-1))
      return new Tail(analyzed.at(-1), localenv)
    },
    compile: cenv => {
      let ret = `(()=>{let ${encodedAt};\n`
      for (let i = 0; i < as.length - 1; ++i) {
        const sub = as[i]
        // todo: don't evaltail statements, i.e. declarations
        if (sub.type === 'decl') ret += `${sub.compile(cenv)};\n`
        else ret += `${encodedAt} = evaltail(${sub.compile(cenv)});\n`
      }
      // assuming last one is not a declaration
      // todo: checl
      return ret + `return new Tail(()=>${as.at(-1).compile(cenv)})})()`
    }
  }
}

const bindparams = (params, vals) => {
  // for now assume params are a list of subs like [a] [b] [c]
  const bindings = new Map()
  for (let i = 0; i < params.length; ++i) {
    const suffix = params[i]
    bindings.set(suffix, {
      // let's say you can't change arg values
      binding: 'const',
      value: vals[i]
    })
  }
  return bindings
}

const binding = (name, value) => [name, {
  binding: 'const',
  value
}]

const argfnstoargs = (argfns, env) => {
  const ret = new Array(argfns.length)
  for (let i = 0; i < argfns.length; ++i) {
    ret[i] = evaltail(argfns[i](env))
  }
  return ret
}

const topenv = new Env(null)
topenv.bindings = new Map([
  // todo: check arity for +, =, -, etc. statically
  binding('log', (argfns, env) => {
    const vals = argfnstoargs(argfns, env)
    console.log(...vals)
    return vals.at(-1)
  }),
  binding('list', (argfns, env) => {
    return argfnstoargs(argfns, env)
  }),
  binding('throw', () => {
    throw Error()
  })
])

export const evaltop = (jevko) => {
  const aglobals = {
    deferred: []
  }

  // analysis-time env:
  const aenv = new Aenv(topaenv, undefined, 'block', aglobals)

  // runtime env:
  const env = new Env(topenv)

  const {subs, suffix} = jevko

  if (subs.length === 0) {
    const analyzed = analyzesuf(suffix, aenv)
    
    // run:
    return analyzed.eval(env)
  }

  const analyzed = analyzesubs(subs, aenv)

  const {deferred} = aglobals

  for (const fn of deferred) {
    fn()
  }
  
  // run:
  const v = analyzed.eval(env)
  return evaltail(v)
}

const evaltail = (v) => {
  // note: trampoline
  while (v instanceof Tail) {
    v = v.body(v.localenv)
  }
  return v
}


const rename = (tree) => {
  const {subs, text} = tree
  const nsubs = []
  for (const {text, tree} of subs) {
    nsubs.push({prefix: text, jevko: rename(tree)})
  }
  return {subs: nsubs, suffix: text}
}

const compileprelude = `// compiled from Jezyk
class Tail {
  constructor(fn) {
    this.fn = fn
  }
}
const evaltail = (v) => {
  // note: trampoline
  while (v instanceof Tail) {
    v = v.fn()
  }
  return v
}
const log = console.log
`

export const compiletop = (jevko) => {
  const aglobals = {
    deferred: []
  }

  // analysis-time env:
  const aenv = new Aenv(topaenv, undefined, 'block', aglobals)

  // compile-time env:
  // todo:
  const cenv = topaenv

  const {subs, suffix} = jevko

  if (subs.length === 0) {
    const analyzed = analyzesuf(suffix, aenv)
    
    return wrapcompiled(analyzed.compile(cenv))
  }

  const analyzed = analyzesubs(subs, aenv)

  const {deferred} = aglobals

  for (const fn of deferred) {
    fn()
  }

  const compiled = wrapcompiled(analyzed.compile(cenv))

  return compiled
}

const wrapcompiled = (str) => {
  return `${compileprelude}
evaltail(${str})`
}


import {parse} from './parse.js'
export const evalstr = (str) => {
  const parsed = parse(str)
  const jevko = rename(parsed)
  return evaltop(jevko)
}

export const compilestr = (str) => {
  const parsed = parse(str)
  const jevko = rename(parsed)
  return compiletop(jevko)
}
