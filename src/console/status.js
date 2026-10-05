import { createContext } from "react";

/** Whether the API answers: "connecting" until the first health check, then "online", "offline" or "no-network". */
export const ServerStatus = createContext("online");
