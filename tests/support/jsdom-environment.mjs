import JSDOMEnvironment from 'jest-environment-jsdom';

const nodeWebApi = {
  AbortController: globalThis.AbortController,
  AbortSignal: globalThis.AbortSignal,
  fetch: globalThis.fetch,
  FormData: globalThis.FormData,
  Headers: globalThis.Headers,
  Request: globalThis.Request,
  Response: globalThis.Response,
};

export default class RetainJsdomEnvironment extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context);
    Object.assign(this.global, nodeWebApi);
  }
}
