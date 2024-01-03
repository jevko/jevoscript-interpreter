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

class Fn {
  constructor(params, body, fnenv) {
    this.params = params
    this.body = body
    this.fnenv = fnenv
  }
}

class Tail {
  constructor(body, localenv) {
    this.body = body
    this.localenv = localenv
  }
}

class SliceExpr {
  constructor(a, b) {
    this.a = a
    this.b = b
  }
}

class Pair {
  constructor(head, tail) {
    this.head = head
    this.tail = tail
  }
  eval(arg) {
    if (typeof arg === 'number') {
      if (arg === 0) return this.head
      else if (this.tail instanceof Pair) return this.tail.eval(arg - 1)
      else throw Error('oops')
    }
    if (typeof arg === 'string') {
      if (arg === 'car') return this.head
      if (arg === 'cdr') return this.tail

      if (arg === 'head') return this.head
      if (arg === 'tail') return this.tail

      if (arg === 'first') return this.head
      if (arg === 'second') return this.tail
    }
    if (arg instanceof SliceExpr) {
      const a = arg.a ?? 0

      // if (a === 0) {
      //   const b =
      // }
      // else 
      {
        // assume a is a number
        const sublist = this.sublistfrom(a)
        if (arg.b === undefined) return sublist
        // assume arg.b is a number
        const b = arg.b - a

        const items = []
        let ptr = sublist
        for (let i = 0; i < b; ++i) {
          items.push(ptr.head)
          // assuming tail is Pair
          ptr = ptr.tail
        }
        let ret = null
        for (let i = items.length - 1; i >= 0; --i) {
          ret = new Pair(items[i], ret)
        }
        return ret
      }
    }

    throw Error('oops 2')
  }
  sublistfrom(arg) {
    if (typeof arg === 'number') {
      if (arg === 0) return this
      else if (this.tail instanceof Pair) return this.tail.sublistfrom(arg - 1)
      else throw Error('oops')
    }
    throw Error('oops')
  }
}

const binding = (name, value) => [name, {
  binding: 'const',
  value
}]

const bind = (type) => (jevko, env) => {
  const {subs} = jevko
  const {length} = subs

  // note: could also allow an "else" clause -- a value to return from let that is not bound to anything
  if (length < 2 || length % 2 !== 0) throw Error(`${type} arity error!`)

  let value
  for (let i = 0; i < length; i += 2) {
    const name = subtoname(subs[i])
    value = evalsub(subs[i + 1], env)

    if (env.bindings.has(name)) throw Error(`${type} can't redeclare variable: ${name}`)

    env.bindings.set(name, {
      binding: type,
      value,
    })
  }

  // return last value
  return value
}

const topenv = new Env(null)
topenv.bindings = new Map([
  binding('true', true),
  binding('false', false),
  binding('fn', (jevko, env) => {
    const {subs, suffix} = jevko
    const params = []
    let body
    if (subs.length === 0) {
      // no params, body is {prefix: '', jevko}
      body = {prefix: '', jevko}
    }
    else {
      body = subs.at(-1)
      for (let i = 0; i < subs.length - 1; ++i) {
        params.push(subs[i])
      }
    }
    return new Fn(params, body, env)
  }),
  // todo: pick one fn
  binding('fn2', (jevko, env) => {
    const {subs, suffix} = jevko
    const params = []
    let body
    if (subs.length === 0) {
      // no params, body is {prefix: '', jevko}
      body = {prefix: '', jevko}
    }
    else if (subs.length === 1) {
      // no params, body is subs[0]
      body = subs[0]
    }
    else {
      {
        const {jevko} = subs[0]
        const {subs: ss, suffix} = jevko
        if (ss.length === 0) params.push({prefix: '', jevko})
        else params.push(...ss)
      }
      body = {prefix: '', jevko: {subs: subs.slice(1), suffix: ''}}
    }
    return new Fn(params, body, env)
  }),
  binding('const', bind('const')),
  binding('let', bind('let')),
  binding('set!', (jevko, env) => {
    const {subs} = jevko
    if (subs.length !== 2) throw Error(`set! arity error!`)
    const name = subtoname(subs[0])
    const value = evalsub(subs[1], env)

    const e = env.lookupenv(name)

    if (e === undefined) throw Error(`set! unknown variable: ${name}`)

    const binding = e.bindings.get(name)

    if (binding.binding !== 'let') throw Error(`set! can't change variable: ${name}`)

    binding.value = value

    return value
  }),
  binding('=', (jevko, env) => {
    const {subs, suffix} = jevko
    if (subs.length !== 2) throw Error('= arity error!')
    const vals = evalargs(jevko, env)
    return vals[0] === vals[1]
  }),
  binding('+', (jevko, env) => {
    const {subs, suffix} = jevko
    if (subs.length !== 2) throw Error('+ arity error!')
    const vals = evalargs(jevko, env)
    // console.log('*****', vals)
    return vals[0] + vals[1]
  }),
  binding('-', (jevko, env) => {
    const {subs, suffix} = jevko
    if (subs.length !== 2) throw Error('- arity error!')
    const vals = evalargs(jevko, env)
    // console.log('*****', vals)
    return vals[0] - vals[1]
  }),
  binding('?', (jevko, env) => {
    const {subs, suffix} = jevko
    // if (subs.length !== 2) throw Error('? arity error!')
    for (let i = 0; i < subs.length - 1; i += 2) {
      const condval = evalsub(subs[i], env)
      // if (condval) return evalsub(subs[i + 1], env)
      if (condval) return new Tail(subs[i + 1], env)// evalsub(subs[i + 1], env)
    }
    // return evalsub(subs.at(-1), env)
    return new Tail(subs.at(-1), env) // evalsub(subs.at(-1), env)
  }),
  binding('', (jevko, env) => {
    const {subs, suffix} = jevko
    if (subs.length === 0) return evalsuf(suffix, env)
    return evalsubs(subs, env)
  }),
  binding('log', (jevko, env) => {
    const vals = evalargs(jevko, env)
    console.log(...vals)
    return vals.at(-1)
  }),
  binding('pair', (jevko, env) => {
    const {subs} = jevko
    if (subs.length !== 2) throw Error(`pair arity error!`)
    const vals = evalargs(jevko, env)
    return new Pair(vals[0], vals[1])
  }),
])

const subtoname = (sub) => {
  const {prefix, jevko} = sub
  console.assert(prefix === '')
  const {subs, suffix} = jevko
  console.assert(subs.length === 0)
  // todo: check if suffix not a number, string, etc.
  return suffix
}

const evalsub = (sub, env) => {
  // note: trampoline
  while (true) {
    const {prefix, jevko} = sub

    const {value} = env.lookup(prefix)
  
    let v
    if (value instanceof Fn) {
      v = evalfn(value, jevko, env)
    }
    else if (typeof value === 'function') {
      v = value(jevko, env)
    }
    else {
      console.error(value, jevko, env)
      throw Error('Unknown value')
    }

    if (v instanceof Tail) {
      sub = v.body
      env = v.localenv
      continue
    }
    return v
  }
}

const evalfn = (fn, jevko, env) => {
  const argvals = evalargs(jevko, env)
  // let's assume body is a single sub
  const {params, body, fnenv} = fn
  if (params.length !== argvals.length) {
    throw Error(`Arity error! Expected ${params.length}, got ${argvals.length}!`)
  }
  const args = bindparams(params, argvals)
  const localenv = new Env(fnenv, args)

  return new Tail(body, localenv)
}

const evalargs = (jevko, env) => {
  const argvals = []
  const {subs, suffix} = jevko
  if (subs.length === 0) {
    argvals.push(evalsuf(suffix, env))
  } else {
    for (const sub of subs) {
      argvals.push(evalsub(sub, env))
    }
  }
  return argvals
}

const bindparams = (params, vals) => {
  // for now assume params are a list of subs like [a] [b] [c]
  const bindings = new Map()
  for (let i = 0; i < params.length; ++i) {
    const {prefix, jevko} = params[i]
    console.assert(prefix === '')
    const {subs, suffix} = jevko
    console.assert(subs.length === 0)
    bindings.set(suffix, {
      // let's say you can't change arg values
      binding: 'const',
      value: vals[i]
    })
  }
  return bindings
}

const evalsuf = (suf, env) => {
  // let's say for now:
  if (suf === '') return ''
  if (suf.startsWith("'")) {
    if (suf.endsWith("'")) return suf.slice(1, -1)
    return suf.slice(1)
  }
  if (suf === 'NaN') return NaN
  const num = Number(suf)
  if (Number.isNaN(num) === false) return num

  const {value} = env.lookup(suf)
  if (value === undefined) throw Error(`Unbound variable: ${suf}`)
  return value 
}

import {parse} from './parse.js'
export const evalstr = (str) => {
  const parsed = parse(str)
  const jevko = rename(parsed)
  return evaltop(jevko)
}

const rename = (tree) => {
  const {subs, text} = tree
  const nsubs = []
  for (const {text, tree} of subs) {
    nsubs.push({prefix: text, jevko: rename(tree)})
  }
  return {subs: nsubs, suffix: text}
}

const evalsubs = (subs, env) => {
  const localenv = new Env(env)
  let v
  for (let i = 0; i < subs.length - 1; ++i) {
    const sub = subs[i]
    v = evalsub(sub, localenv)
  }
  return new Tail(subs.at(-1), localenv)
  // return v
}

export const evaltop = (jevko) => {
  const env = topenv

  const {subs, suffix} = jevko

  if (subs.length === 0) return evalsuf(suffix, env)

  let v = evalsubs(subs, env)
  return evalsub(v.body, v.localenv)
}