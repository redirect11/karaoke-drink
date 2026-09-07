'use strict'

// Mock minimale di Firestore per i test BDD delle Cloud Functions.
// Supporta solo il sottoinsieme di API usato da functions/lib/payment-service.js:
//   db.collection(name)
//     .where(field, op, value).limit(n).get() → { empty, docs: [{ id, ref, data() }] }
//     .add(data) → ref
//     .doc(id) → { update(patch) }
//
// I dati sono tenuti in memoria; ogni documento espone .ref.update() che muta
// il documento in-place, così i test possono asserire lo stato finale.

function createFakeFirestore(seed = {}) {
  // seed: { collectionName: { docId: data, ... }, ... }
  const store = {}
  for (const [col, docs] of Object.entries(seed)) {
    store[col] = {}
    for (const [id, data] of Object.entries(docs)) {
      store[col][id] = { ...data }
    }
  }

  let autoId = 0
  const calls = { adds: [], updates: [] }

  function ensureCol(name) {
    if (!store[name]) store[name] = {}
    return store[name]
  }

  function makeDocRef(colName, id) {
    return {
      id,
      async update(patch) {
        const col = ensureCol(colName)
        col[id] = { ...(col[id] || {}), ...patch }
        calls.updates.push({ collection: colName, id, patch })
        return undefined
      },
      async set(data, opts = {}) {
        const col = ensureCol(colName)
        col[id] = opts.merge ? { ...(col[id] || {}), ...data } : { ...data }
        calls.updates.push({ collection: colName, id, patch: data, set: true })
        return undefined
      },
      async get() {
        const col = ensureCol(colName)
        const exists = Object.prototype.hasOwnProperty.call(col, id)
        return {
          id,
          exists,
          ref: makeDocRef(colName, id),
          data: () => (exists ? { ...col[id] } : undefined),
          get: (field) => (exists ? col[id][field] : undefined),
        }
      },
    }
  }

  function makeSnapshot(colName, id) {
    const col = ensureCol(colName)
    return {
      id,
      ref: makeDocRef(colName, id),
      data: () => ({ ...col[id] }),
    }
  }

  function makeQuery(colName, predicates, limitN) {
    return {
      where(field, _op, value) {
        return makeQuery(colName, [...predicates, { field, value }], limitN)
      },
      limit(n) {
        return makeQuery(colName, predicates, n)
      },
      async get() {
        const col = ensureCol(colName)
        let ids = Object.keys(col).filter((id) =>
          predicates.every((p) => col[id][p.field] === p.value)
        )
        if (typeof limitN === 'number') ids = ids.slice(0, limitN)
        const docs = ids.map((id) => makeSnapshot(colName, id))
        return { empty: docs.length === 0, size: docs.length, docs }
      },
    }
  }

  function collection(name) {
    return {
      where(field, op, value) {
        return makeQuery(name, [{ field, value }], undefined)
      },
      limit(n) {
        return makeQuery(name, [], n)
      },
      async get() {
        return makeQuery(name, [], undefined).get()
      },
      async add(data) {
        const id = `auto-${++autoId}`
        ensureCol(name)[id] = { ...data }
        calls.adds.push({ collection: name, id, data })
        return makeDocRef(name, id)
      },
      doc(id) {
        return makeDocRef(name, id)
      },
    }
  }

  return {
    db: { collection },
    store,
    calls,
  }
}

// Sentinella per il serverTimestamp, così i test possono verificarne la presenza.
const SERVER_TIMESTAMP = '__SERVER_TIMESTAMP__'
function fakeServerTimestamp() {
  return SERVER_TIMESTAMP
}

module.exports = { createFakeFirestore, fakeServerTimestamp, SERVER_TIMESTAMP }
