export interface ShellViewer {
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  /**
   * Whether to show the 系统管理 entry. Computed on the server from the platform role
   * (platformCapabilities); client components must not derive it from role names.
   */
  canAccessAdmin?: boolean;
}
