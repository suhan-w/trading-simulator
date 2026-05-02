/** Matches backend roles allowed to call `/api/admin/*`. */
export function isAdminRole(role) {
  return role === "moderator" || role === "super_admin";
}

export function isSuperAdmin(role) {
  return role === "super_admin";
}
