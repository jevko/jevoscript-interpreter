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
  for (let i = 0; i < length; i += 2) {
    const name = subtoname(subs[i])

    if (aenv.bindings.has(name)) throw Error(`${type} can't redeclare variable: ${name}`)
    
    const value = analyzesub(subs[i + 1], aenv)
    
    aenv.bindings.set(name, {
      binding: type,
      ...value,
    })

    bs.push([name, value.eval])
  }

  return {
    eval: env => {
      let v
      for (const [name, value] of bs) {
        v = evaltail(value(env))
        env.bindings.set(name, {value: v})
      }
      // return last value
      return v
    }
  }
}

const topaenv = new Aenv(null, null, 'top', 'hack')
topaenv.bindings = new Map([
  abinding('true', true, 'const'),
  abinding('false', false, 'const'),
  abinding('fn', (jevko, aenv) => {
    const {subs, suffix} = jevko
    const params = []
    let body
    const localaenv = new Aenv(aenv, null, 'fn')
    if (subs.length === 0) {
      // no params, body is {prefix: '', jevko}
      // body = {prefix: '', jevko}
      body = analyzesuf(suffix, localaenv).eval
    }
    else if (subs.length === 1) {
      // no params, body is subs[0]
      // body = subs[0]
      body = analyzesub(subs[0], localaenv).eval
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
      // body = analyzesubs(subs.slice(1), localaenv)
      body = analyzesubs(subs.slice(1), localaenv).eval
      
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

          return new Tail(body, localenv)
        }
      }
    }
  }),
  abinding('const', abind('const')),
  abinding('let', abind('let')),
  abinding('set!', (jevko, aenv) => {
    const {subs} = jevko
    if (subs.length !== 2) throw Error(`set! arity error!`)
    const name = subtoname(subs[0])
    const value = analyzesub(subs[1], aenv).eval

    const e = aenv.lookupenv(name)

    if (e === undefined) throw Error(`set! unknown variable: ${name}`)

    const binding = e.bindings.get(name)

    if (binding.binding !== 'let') throw Error(`set! can't change variable: ${name}`)

    return {
      eval: env => {
        const e = env.lookupenv(name)
        const binding = e.bindings.get(name)
        binding.value = evaltail(value(env))
        return value
      }
    }
  }),
  abinding('?', (jevko, aenv) => {
    const {subs, suffix} = jevko
    if (subs.length < 2) throw Error('? arity error!')
    const hasalt = subs.length % 2 === 1
    const boundary = hasalt? subs.length - 1: subs.length
    const xs = []
    for (let i = 0; i < boundary; i += 2) {
      const condval = analyzesub(subs[i], aenv).eval
      // console.log('ssss', subs.length, i + 1, subs[i + 1])
      xs.push([condval, analyzesub(subs[i + 1], aenv).eval])
    }
    let alt
    if (hasalt) {
      alt = analyzesub(subs.at(-1), aenv).eval
    }
    // note: let's say ? w/o alt returns ''
    // note: could optimize this by generating a version which returns '' instead of new Tail after for
    else alt = env => ''

    return {
      eval: env => {
        for (const [condf, conseqf] of xs) {
          if (condf(env)) return new Tail(conseqf, env)
        }
        return new Tail(alt, env)
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
    const argfns = analyzeargs(jevko, aenv)
    if (argfns.length !== 2) throw Error('= arity')
    // todo: static type checking?
    // would verify here that args are numbers
    // aenv would contain type info
    return {
      eval: (env) => {
        const vals = argfnstoargs(argfns, env)
        return vals[0] === vals[1]
      }
    }
  }),
  abinding('-', (jevko, aenv) => {
    const argfns = analyzeargs(jevko, aenv)
    if (argfns.length !== 2) throw Error('- arity')
    // todo: static type checking?
    // would verify here that args are numbers
    // aenv would contain type info
    return {
      eval: (env) => {
        const vals = argfnstoargs(argfns, env)
        return vals[0] - vals[1]
      }
    }
  }),
  // note: + optimized at analyze-time
  abinding('+', (jevko, aenv) => {
    const argfns = analyzeargs(jevko, aenv)
    if (argfns.length !== 2) throw Error('+ arity')
    // todo: static type checking?
    // would verify here that args are numbers
    // aenv would contain type info
    return {
      eval: (env) => {
        const vals = argfnstoargs(argfns, env)
        return vals[0] + vals[1]
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

      const argfns = analyzeargs(jevko, aenv)
      return {
        eval: env => {
          const found = env.lookup(prefix)

          if (found === undefined) {
            throw Error(`Unknown name: '${prefix}'`)
          }

          const {value} = found

          return value(argfns, env)
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

  const argfns = analyzeargs(jevko, aenv)
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

      return value(argfns, env)
    }
  }
}

const analyzeargs = (jevko, aenv) => {
  const argfns = []
  const {subs, suffix} = jevko
  if (subs.length === 0) {
    // note: empty suffix means fn invoked with 0 args
    if (suffix !== '') argfns.push(analyzesuf(suffix, aenv).eval)
  } else {
    for (const sub of subs) {
      argfns.push(analyzesub(sub, aenv).eval)
    }
  }
  return argfns
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
  if (suf === '') return {eval: env => ''}
  if (suf.startsWith("'")) {
    if (suf.endsWith("'")) return {eval: env => suf.slice(1, -1)}
    return {eval: env => suf.slice(1)}
  }
  if (suf === 'NaN') return {eval: env => NaN}
  if (matchnum(suf)) {
    const num = Number(suf.replaceAll(/ |_/g, ''))
    if (Number.isNaN(num) === false) return {eval: env => num}
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
  if (type === 'const') return {eval: env => value}
  // ?todo: could support CTFE
  // todo: analyze `found` further

  // runtime value:
  return {
    eval: env => {
      const {value} = env.lookup(suf)
      return value 
    }
  }
}

const analyzesubs = (subs, aenv1) => {
  const aenv = new Aenv(aenv1, null, 'block')
  const analyzed = []

  for (const sub of subs) {
    analyzed.push(analyzesub(sub, aenv).eval)
  }

  return {
    eval: env => {
      const localenv = new Env(env)
      let v
      for (let i = 0; i < analyzed.length - 1; ++i) {
        const sub = analyzed[i]
        v = evaltail(sub(localenv))
      }
      // console.log('>>>', subs.at(-1))
      return new Tail(analyzed.at(-1), localenv)
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
  binding('throw', () => {
    throw Error()
  })
])

export const evaltop = (jevko) => {
  const aglobals = {
    deferred: []
  }

  // analysis-time env:
  const aenv = new Aenv(topaenv, undefined, 'top2', aglobals)

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
  // console.log('topv', v, v.body.toString())
  return evaltail(v)
  // return v.body(v.localenv)
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


import {parse} from './parse.js'
export const evalstr = (str) => {
  const parsed = parse(str)
  const jevko = rename(parsed)
  return evaltop(jevko)
}
