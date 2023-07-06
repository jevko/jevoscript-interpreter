import {compilestr} from './analyze.js'

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
]

log[fibiter[ [1] [0] [25] ]]
`

eval(compilestr(src))