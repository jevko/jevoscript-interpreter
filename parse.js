export const parse = (str) => {
  return (preproc(totree(str)))
}

export const totree = (str, state = {
  depth: 0,
  index: 0,
}) => {
  const subs = []
  let text = ''
  for (; state.index < str.length; ++state.index) {
    const c = str[state.index]
    if (c === '[') {
      state.depth += 1
      state.index += 1
      const tree = totree(str, state)
      subs.push({text, tree})
      text = ''
    }
    else if (c === ']') {
      if (state.depth < 1) throw SyntaxError(`Unexpected opener (]) at ${state.index}!`)
      state.depth -= 1
      return {subs, text}
    }
    else if (c === '`') {
      state.index += 1
      let n = 0
      for (; state.index < str.length && str[state.index] === '`'; ++state.index, ++n) {}
      let a = state.index
      let endreached = false
      outer: for (; state.index < str.length; ++state.index) {
        if (str[state.index] === '`') {
          let b = state.index
          state.index += 1
          for (let i = 0; i < n; ++state.index, ++i) {
            if (state.index >= str.length) break outer
            if (str[state.index] !== '`') continue outer
          }
          endreached = true
          const t = str.slice(a, b)
          if (t.startsWith("'") === false) text += "'"
          text += t
          if (t.endsWith("'") === false) text += "'"
          break
        }
      }
      if (endreached === false) throw SyntaxError(`Unclosed multistring starting at ${a}`)
      state.index -= 1
    }
    else text += c
  }
  if (state.depth > 0) throw SyntaxError(`Unexpected end: missing ${state.depth} closers (])!`)
  return {subs, text}
}

export const preproc = (tree) => {
  const {subs, text} = tree
  const nsubs = []
  let escaped
  for (const {text, tree} of subs) {
    let tx
    if (escaped === undefined) {
      tx = text.split('\n').at(-1).trim()
      if (tx.startsWith(';')) continue
      else if (tx === '\\') {
        escaped = esc(tree)
        continue
      } 
    } else {
      if (text.trim() !== '') throw SyntaxError(`Unexpected text after escaped prefix: |${text}|`)
      tx = escaped
      escaped = undefined
    }
    nsubs.push({text: tx, tree: preproc(tree)})
  }
  if (nsubs.length > 0) {
    if (escaped !== undefined) throw SyntaxError(`Unexpected escaped text after subs: |${text}|`)
    // note: ignoring original text
    return {subs: nsubs, text: ''}
  }
  if (escaped !== undefined) {
    // note: could also allow text after escaped suffix (would be ignored)
    if (text.trim() !== '') throw SyntaxError(`Unexpected text after escaped suffix: |${text}|`)
    return {subs: [], text: escaped}
  }
  // note: could alternatively do text.split('\n').at(-1).trim()
  return {subs: [], text}
}

export const esc = (tree) => {
  let ret = ''
  const {subs, text} = tree
  for (const {text, tree} of subs) {
    ret += text
    if (tree.subs.length > 0) throw SyntaxError(`Unexpected nesting in escape!`)
    const {text: t} = tree
    if (t === '{') ret += '['
    else if (t === '}') ret += ']'
    else throw SyntaxError(`Unexpected escape: |${t}|`)
  }
  return ret + text
}

export const toval = (tree) => {
  const {subs} = tree
  if (subs.length === 0) return tree.text
  if (subs[0].text === '') {
    // to array
    const ret = []
    for (const {text, tree} of subs) {
      if (text !== '') throw TypeError(`Unexpected text in array: |${text}|`)
      ret.push(toval(tree))
    }
    return ret
  }
  // to object
  const ret = {}
  for (const {text, tree} of subs) {
    if (Object.hasOwn(ret, text)) throw TypeError(`Duplicate key: |${text}|`)
    ret[text] = toval(tree)
  }
  return ret
}