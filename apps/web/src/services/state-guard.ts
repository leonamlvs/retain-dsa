export const stateStorageKey = 'retain-dsa.state.v1';
export const stateChangedEvent = 'retain-dsa:state-changed';
let responseFence = false;
let requestEpoch = 0;
let storageFallback: ResponseState | null = null;

export interface ResponseState {
  databaseId?: string;
  generation: string;
  stateRevision: string;
}
function validState(value: unknown): value is ResponseState {
  if (!value || typeof value !== 'object') return false;
  const state = value as ResponseState;
  return (
    typeof state.generation === 'string' &&
    Boolean(state.generation) &&
    typeof state.stateRevision === 'string' &&
    /^\d{1,30}$/.test(state.stateRevision) &&
    (state.databaseId === undefined || typeof state.databaseId === 'string')
  );
}
function readState(): ResponseState | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(stateStorageKey) ?? 'null');
    return validState(value) ? value : null;
  } catch {
    return storageFallback;
  }
}
function storeState(state: ResponseState): void {
  storageFallback = state;
  try {
    localStorage.setItem(stateStorageKey, JSON.stringify(state));
  } catch {
    /* Browser storage may be disabled. */
  }
  window.dispatchEvent(new Event(stateChangedEvent));
}
export class StaleResponseError extends Error {
  constructor() {
    super('Local data changed. Please retry the connection.');
    this.name = 'StaleResponseError';
  }
}
export const isStaleResponseError = (error: unknown): error is StaleResponseError =>
  error instanceof StaleResponseError;
export const captureResponseEpoch = () => requestEpoch;
export function assertResponseEpoch(epoch: number): void {
  if (epoch !== requestEpoch) throw new StaleResponseError();
}
export function acceptResponseState(state: ResponseState, allowDuringFence = false): ResponseState {
  if (!validState(state)) throw new Error('The server returned an invalid progress version.');
  if (responseFence && !allowDuringFence) throw new StaleResponseError();
  const current = readState();
  if (
    current &&
    (BigInt(state.stateRevision) < BigInt(current.stateRevision) ||
      (state.generation !== current.generation && !allowDuringFence))
  )
    throw new StaleResponseError();
  const next = { ...current, ...state };
  if (
    !current ||
    current.stateRevision !== state.stateRevision ||
    current.generation !== state.generation
  )
    storeState(next);
  return next;
}
// Only a newly issued uncached session request can establish a lower watermark.
// Every request issued before it is fenced out, including old session callbacks.
export function acceptSession(state: ResponseState & { databaseId: string }, epoch: number): void {
  assertResponseEpoch(epoch);
  if (!validState(state) || !state.databaseId) throw new Error('Invalid application session.');
  storeState(state);
  responseFence = false;
}
export function acceptVersionHeaders(
  response: Response,
  allowDuringFence = false,
): ResponseState | null {
  const generation = response.headers.get('x-progress-generation');
  const stateRevision = response.headers.get('x-state-revision');
  return generation && stateRevision
    ? acceptResponseState({ generation, stateRevision }, allowDuringFence)
    : null;
}
export const currentResponseState = (): ResponseState | null => readState();
export function beginResponseFence(): number {
  responseFence = true;
  return ++requestEpoch;
}
export function endResponseFence(): void {
  responseFence = false;
  ++requestEpoch;
}
