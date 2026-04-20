// Party — IndexedDB message store.
// Messages roll off after 24h. Everything stays local to this device.

const DB_NAME = 'party'
const DB_VERSION = 1
const STORE = 'messages'
const HISTORY_HOURS = 24

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' })
        s.createIndex('byRoomTs', ['room', 'ts'])
        s.createIndex('byTs', 'ts')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const Store = {
  _db: null,

  async open() {
    if (!this._db) this._db = await openDb()
    return this._db
  },

  async addMessage(msg) {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const req = tx.objectStore(STORE).put(msg)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  },

  async getMessages(room) {
    const db = await this.open()
    const cutoff = Date.now() - HISTORY_HOURS * 3600 * 1000
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const idx = tx.objectStore(STORE).index('byRoomTs')
      const range = IDBKeyRange.bound([room, cutoff], [room, Date.now() + 1])
      const req = idx.getAll(range)
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.ts - b.ts))
      req.onerror = () => reject(req.error)
    })
  },

  async prune() {
    const db = await this.open()
    const cutoff = Date.now() - HISTORY_HOURS * 3600 * 1000
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const idx = tx.objectStore(STORE).index('byTs')
      const req = idx.openCursor(IDBKeyRange.upperBound(cutoff))
      req.onsuccess = () => {
        const c = req.result
        if (c) { c.delete(); c.continue() } else { resolve() }
      }
      req.onerror = () => reject(req.error)
    })
  },

  async clearAll() {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const req = tx.objectStore(STORE).clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  },
}
