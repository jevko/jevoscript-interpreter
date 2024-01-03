import {evalstr} from './analyze.js'

const src = `
let[
  [fib]  fn[  [n]  ?[
    =[ [n] [0] ]  [0]
    =[ [n] [1] ]  [1]
    +[ fib[-[[n][1]]] fib[-[[n][2]]] ]
  ]]
  [fibiter]  fn[ [[a] [b] [count]]
    log[b]
    ?[
      =[ [count] [0] ]  [b]
      fibiter[  +[ [a] [b] ]  [a]  -[ [count] [1] ]  ]
    ]
  ]
  [even?]  fn[  [n]
    ?[
      =[ [n] [0] ]  [true]
      =[ [n] [1] ]  [false]
      odd?[-[ [n] [1] ]]
    ]
  ]
  [odd?]  fn[  [n]
    log[n]
    ?[
      =[ [n] [0] ]  [false]
      =[ [n] [1] ]  [true]
      ;=[ [n] [90] ]  ;throw[]
      even?[-[ [n] [1] ]]
    ]
  ]
]

;log[fibiter[ [1] [0] [25] ]]
;fib[25]
;log['*****]
;even?[[10001][1]]
;even?[[10001]]
;even?[101]
even?[2]
`

console.log(evalstr(src))