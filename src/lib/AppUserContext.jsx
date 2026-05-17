import { createContext, useContext } from 'react';

export const AppUserContext = createContext(null);

export const useAppUser = () => useContext(AppUserContext);

/**
 * Returns true if the current app user is read-only (profile === 'padrao').
 * Read-only users can only view — no create, edit or delete.
 */
export const useReadOnly = () => {
  const appUser = useContext(AppUserContext);
  return appUser?.profile === 'padrao';
};