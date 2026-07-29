/* ==========================================================================
   session.js
   In-memory view of "who's logged in" + "current shift", backed by
   db.js meta table. Dexie is async, so we hydrate once on load and
   expose window.auth.ready for any script that needs to wait on it.
   Load order: db.js -> api.js -> auth.js -> session.js -> everything else.
   ========================================================================== */

const AppSession = {
  current: { user_id: null, pharmacy_id: null, name: null, role: null, shift_id: null, shift_status: null },

  async _init() {
    const userId = await window.localDB.getMeta('logged_in_user_id');
    if (!userId) return;
    const user = await window.localDB.db.users_cache.get(userId);
    this.current.user_id = userId;
    this.current.pharmacy_id = user?.pharmacy_id ?? null;
    this.current.name = user?.name ?? null;
    this.current.role = user?.role ?? null;
    this.current.shift_id = await window.localDB.getMeta('active_shift_id');
    this.current.shift_status = await window.localDB.getMeta('active_shift_status');
  },

  getCurrentUser() {
    return this.current;
  },

  async setShift(shiftId, status) {
    this.current.shift_id = shiftId;
    this.current.shift_status = status;
    await window.localDB.setMeta('active_shift_id', shiftId);
    await window.localDB.setMeta('active_shift_status', status);
  },

  async logout() {
    window.authToken.set(null);
    await window.localDB.setMeta('logged_in_user_id', null);
    await window.localDB.setMeta('active_shift_id', null);
    await window.localDB.setMeta('active_shift_status', null);
    this.current = { user_id: null, pharmacy_id: null, name: null, role: null, shift_id: null, shift_status: null };
  }
};

AppSession.ready = AppSession._init();
window.auth = AppSession;