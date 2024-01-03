export const stringify = (val) => {
  if (val === null) throw TypeError(`Unexpected null`)
  if (typeof val === 'string') return esc(val)
  if (Array.isArray(val)) {
    let ret = ''
    for (const it of val) {
      ret += `[${stringify(it)}]`
    }
    return ret
  }
  if (typeof val === 'object') {
    let ret = ''
    for (const [k, v] of Object.entries(val)) {
      ret += `${esc(k)}[${stringify(v)}]`
    }
    return ret
  }
  throw TypeError(`Unsupported type: ${typeof val}`)
}

const esc = (str) => {
  let h = 0
  const parts = []

  if (str === '\\') return '\\[\\]'

  for (let i = 0; i < str.length; ++i) {
    const c = str[i]
    if (c === '[') {
      parts.push(str.slice(h, i), '[{]')
      h = i + 1
    }
    else if (c === ']') {
      parts.push(str.slice(h, i), '[}]')
      h = i + 1
    }
  }
  const tail = str.slice(h)
  if (parts.length > 0) return `\\[${parts.join('')}${tail}]`
  return tail
}

export const stringifytree = (tree) => {
  let ret = ''
  const {subs, text} = tree
  for (const {text, tree} of subs) {
    ret += text + '[' + stringifytree(tree) + ']'
  }
  return ret + text
}