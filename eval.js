class Env {
  bindings = new Map()
  constructor(parent, bindings) {
    this.parent = parent
    if (bindings instanceof Map) {
      this.bindings = bindings
    }
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

const binding = (name, value) => [name, {
  binding: 'const',
  value
}]

const topenv = new Env(null)
topenv.bindings = new Map([
  ['true', {
    binding: 'const',
    value: true
  }],
  ['false', {
    binding: 'const',
    value: false
  }],
  ['fn', {
    binding: 'const',
    value: (jevko, env) => {
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
    }
  }],
  ['let', {
    binding: 'const',
    value: (jevko, env) => {
      const {subs} = jevko
      // for now allow only non-variadic let
      if (subs.length !== 2) throw Error(`let arity error!`)
      const name = subtoname(subs[0])
      const value = evalsub(subs[1], env)

      if (env.bindings.has(name)) throw Error('oops')

      env.bindings.set(name, {
        binding: 'let',
        value,
      })

      return value
    }
  }],
  ['=', {
    binding: 'const',
    value: (jevko, env) => {
      const {subs, suffix} = jevko
      if (subs.length !== 2) throw Error('= arity error!')
      const vals = evalargs(jevko, env)
      return vals[0] === vals[1]
    }
  }],
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
      if (condval) return new Tail(subs[i + 1], env)// evalsub(subs[i + 1], env)
    }
    return new Tail(subs.at(-1), env) // evalsub(subs.at(-1), env)
  }),
  binding('', (jevko, env) => {
    const {subs, suffix} = jevko
    if (subs.length === 0) return evalsuf(jevko.suffix, env)
    return evalsubs(subs, env)
  }),
  binding('log', (jevko, env) => {
    const vals = evalargs(jevko, env)
    console.log(...vals)
    return vals.at(-1)
  })
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
  let i = 0
  while (true) {
    console.log('iter', i++)
    const {prefix, jevko} = sub

    // console.log(env, prefix)
    const {value} = env.lookup(prefix)
  
    if (value instanceof Fn) {
      let v = evalfn(value, jevko, env)
      if (v instanceof Tail) {
        console.log('aaa', v)
        sub = v.body
        env = v.localenv
        continue
      }
      console.log('VVV', v)
      // while (v instanceof Tail) {
      //   v = evalsub(v.body, v.localenv)
      // }
      return v
    }
  
    if (typeof value === 'function') {
      return value(jevko, env)
    }
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
  let v
  for (const sub of subs) {
    v = evalsub(sub, env)
  }
  return v
}

export const evaltop = (jevko) => {
  const env = topenv

  const {subs, suffix} = jevko

  if (subs.length === 0) return evalsuf(suffix, env)

  let v
  for (const sub of subs) {
    v = evalsub(sub, env)
  }
  return v
}

// const evalsubtail = (sub, env) => {
//   let v = evalsub(sub, env)
//   while (v instanceof Tail) {
//     v = evalsub(v.body, v.localenv)
//   }
//   return v
// }