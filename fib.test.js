import {evalstr} from './analyze.js'

const src = `
let[
  [fib]  fn[  [n]  ?[
    =[ [n] [0] ]  [0]
    =[ [n] [1] ]  [1]
    +[ fib[-[[n][1]]] fib[-[[n][2]]] ]
  ]]
]
fib[35]
`
console.log(evalstr(src))