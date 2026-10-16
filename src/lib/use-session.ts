import { parseSession, sessionItem } from "./auth";
import { createStorageStore } from "./storage-store";

const store = createStorageStore(sessionItem, parseSession);

/** Await before the first render, so signed-in users never see the sign-in screen */
export const loadSession = store.load;

export const useSession = store.useValue;
