import {evalstr} from '../analyze.js'

const src = `
let[
  [even?]  fn[  [n]
    ?[
      =[ [n] [0] ]  [true]
      odd?[-[ [n] [1] ]]
    ]
  ]
  [odd?]  fn[  [n]
    ?[
      =[ [n] [0] ]  [false]
      even?[-[ [n] [1] ]]
    ]
  ]
]

const[ [a] [5] ]
[
  log[a]
  const[  [a]  +[ [a] [10] ]  ]
  log[a]
]

[
  const[  [a]  fn[b]  ]
  const[  [b]  [5]  ]
  a[]
]
`

console.log(evalstr(src))