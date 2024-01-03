import {test} from 'node:test'
import assert from 'node:assert/strict'

import {encodeid, compilestr} from "./analyze.js"

test('encodeid', () => {
  assert.equal(encodeid('@'), '$1s$')
  assert.equal(encodeid('hello world'), 'hello$w$world')
  assert.equal(encodeid('𐀒'), '$1eky$')
})

test('@', () => {
  const ret = compilestr(`[5] +[[@][3]]`)
  console.log(ret)

  assert.equal(eval(ret), 8)
})


test('.', () => {
  // todo:
  const ret = compilestr(`list[[1][2][3]].map[  jsfn[ [a] +[[a][1]] ]  ]`)
  console.log(ret)

  assert.equal(eval(ret), 8)
})