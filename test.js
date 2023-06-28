import {parse} from './parse.js'
import {evalstr} from './eval.js'

const src = `
let[
  [fib]  fn[  [n]  ?[
    =[ [n] [0] ]  [0]
    =[ [n] [1] ]  [1]
    +[ fib[-[[n][1]]] fib[-[[n][2]]] ]
  ]]
  [fibiter]  fn[ [a] [b] [count] [
    log[b]
    ?[
      =[ [count] [0] ]  [b]
      fibiter[  +[ [a] [b] ]  [a]  -[ [count] [1] ]  ]
    ]
  ]]
  [even?]  fn[  [n]
    ?[
      =[ [n] [0] ]  [true]
      =[ [n] [1] ]  [false]
      odd?[-[ [n] [1] ]]
    ]
  ]
  [odd?]  fn[  [n]  [
    log[n]
    ?[
      =[ [n] [0] ]  [false]
      =[ [n] [1] ]  [true]
      even?[-[ [n] [1] ]]
    ]
  ]]
]

;log[fibiter[ [1] [0] [25] ]]
;fib[25]
log['*****]
even?[10001]
`


console.log(parse('`hohoho`xyz'))
console.log(parse('sss`hohoho`sss'))
console.log(parse('sss``hohoho``sss'))
console.log(parse("sss`'hohoho'`sss"))
console.log(parse("sss``'hohoho'``sss"))
console.log(parse("sss``'hohoho`'``sss"))
console.log(parse("`   str   `"))
console.log(parse("special [`   str   `]"))
// console.log(parse('sss`hohoho``sss'))
// console.log('***\n', parse("'`hohoho``'"))

console.log(evalstr(src))