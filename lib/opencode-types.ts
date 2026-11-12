/**
 * The shapes of the OpenCode service, as the dashboard reads them.
 *
 * They live apart from `lib/opencode.ts` because that module talks to the
 * service with Node APIs (`child_process`, `fs`) — it can only run on the
 * server, while the chat that renders these shapes runs in the browser.
 */

export interface OcModelRef {
  id: string;
  providerID: string;
  variant?: string;
}

export interface OcSession {
  id: string;
  title?: string;
  agent?: string;
  model?: OcModelRef;
  cost?: number;
  tokens?: { input?: number; output?: number; reasoning?: number };
  time?: { created?: number; updated?: number; busy?: number; idle?: number };
  location?: { directory?: string };
  outcome?: string;
}

export interface OcPart {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  state?: {
    status?: string;
    input?: unknown;
    output?: string;
    title?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface OcMessage {
  id: string;
  type: string;
  text?: string;
  content?: OcPart[];
  time?: { created?: number; completed?: number; streamed?: number };
  model?: OcModelRef;
  agent?: string;
}

export interface OcPermission {
  id: string;
  sessionID: string;
  action: string;
  resources?: string[];
  message?: string;
}

export interface OcAgent {
  id: string;
  name: string;
  description?: string;
  mode?: string;
  hidden?: boolean;
  model?: OcModelRef;
}

export interface OcCommand {
  name: string;
  description?: string;
}

export interface OcModel extends OcModelRef {
  name?: string;
}

export interface OcServiceInfo {
  version?: string;
  pid?: number;
  hostname?: string;
  urls?: string[];
  capabilities?: Record<string, unknown>;
  reachable?: boolean;
  url?: string | null;
}

/** what `GET /api/opencode` answers */
export interface OcStatus {
  enabled: boolean;
  authorized: boolean;
  directory?: string;
  service?: OcServiceInfo;
  sessions?: OcSession[];
  agents?: OcAgent[];
  models?: OcModel[];
  commands?: OcCommand[];
  permissions?: OcPermission[];
  error?: string;
}
