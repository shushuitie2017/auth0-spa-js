import 'fast-text-encoding';
import * as esCookie from 'es-cookie';
import unfetch from 'unfetch';
import { verify } from '../../src/jwt';
import { MessageChannel } from 'worker_threads';
import * as utils from '../../src/utils';
import * as scope from '../../src/scope';
import { expectToHaveBeenCalledWithAuth0ClientParam } from '../helpers';
import { TEST_AUTH0_CLIENT_QUERY_STRING } from '../constants';

// @ts-ignore
import { loginWithRedirectFn, setupFn } from './helpers';
import { TEST_CLIENT_ID, TEST_CODE_CHALLENGE, TEST_DOMAIN } from '../constants';
import { InMemoryAsyncCacheNoKeys } from '../cache/shared';

jest.mock('unfetch');
jest.mock('es-cookie');
jest.mock('../../src/jwt');
jest.mock('../../src/worker/token.worker');

const mockWindow = <any>global;
const mockFetch = (mockWindow.fetch = <jest.Mock>unfetch);
const mockVerify = <jest.Mock>verify;
const loginWithRedirect = loginWithRedirectFn(mockWindow, mockFetch);

jest
  .spyOn(utils, 'bufferToBase64UrlEncoded')
  .mockReturnValue(TEST_CODE_CHALLENGE);

jest.spyOn(utils, 'runPopup');

const setup = setupFn(mockVerify);

describe('Auth0Client', () => {
  const oldWindowLocation = window.location;

  beforeEach(() => {
    // https://www.benmvp.com/blog/mocking-window-location-methods-jest-jsdom/
    delete window.location;
    window.location = Object.defineProperties(
      {},
      {
        ...Object.getOwnPropertyDescriptors(oldWindowLocation),
        assign: {
          configurable: true,
          value: jest.fn()
        }
      }
    ) as Location;
    // --

    mockWindow.open = jest.fn();
    mockWindow.addEventListener = jest.fn();
    mockWindow.crypto = {
      subtle: {
        digest: () => 'foo'
      },
      getRandomValues() {
        return '123';
      }
    };
    mockWindow.MessageChannel = MessageChannel;
    mockWindow.Worker = {};
    jest.spyOn(scope, 'getUniqueScopes');
    sessionStorage.clear();
  });

  afterEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    window.location = oldWindowLocation;
  });

  describe('logout()', () => {
    it('removes authenticated cookie from storage', async () => {
      const auth0 = setup();
      auth0.logout();

      expect(esCookie.remove).toHaveBeenCalledWith(
        `auth0.${TEST_CLIENT_ID}.is.authenticated`, {}
      );
    });

    it('removes authenticated cookie from storage when cookieDomain is set', async () => {
      const auth0 = setup({ cookieDomain: TEST_DOMAIN });
      auth0.logout();

      expect(esCookie.remove).toHaveBeenCalledWith(
          `auth0.${TEST_CLIENT_ID}.is.authenticated`, { domain: TEST_DOMAIN }
      );
    });

    it('removes the organization hint cookie from storage', async () => {
      const auth0 = setup();
      auth0.logout();

      expect(esCookie.remove).toHaveBeenCalledWith(
        `auth0.${TEST_CLIENT_ID}.organization_hint`, {}
      );
    });

    it('calls `window.location.assign` with the correct url', async () => {
      const auth0 = setup();

      auth0.logout();

      expect(window.location.assign).toHaveBeenCalledWith(
        `https://${TEST_DOMAIN}/v2/logout?client_id=${TEST_CLIENT_ID}${TEST_AUTH0_CLIENT_QUERY_STRING}`
      );
    });

    it('calls `window.location.assign` with the correct url when `options.federated` is true', async () => {
      const auth0 = setup();

      auth0.logout({ federated: true });

      expect(window.location.assign).toHaveBeenCalledWith(
        `https://${TEST_DOMAIN}/v2/logout?client_id=${TEST_CLIENT_ID}${TEST_AUTH0_CLIENT_QUERY_STRING}&federated`
      );
    });

    it('calls `window.location.assign` with the correct url with custom `options.auth0Client`', async () => {
      const auth0Client = { name: '__test_client_name__', version: '9.9.9' };
      const auth0 = setup({ auth0Client });

      auth0.logout();

      expectToHaveBeenCalledWithAuth0ClientParam(
        window.location.assign,
        auth0Client
      );
    });

    it('clears the cache', async () => {
      const auth0 = setup();

      jest
        .spyOn(auth0['cacheManager'], 'clearSync')
        .mockReturnValueOnce(undefined);

      auth0.logout();

      expect(auth0['cacheManager']['clearSync']).toHaveBeenCalled();
    });

    it('removes authenticated cookie from storage when `options.localOnly` is true', async () => {
      const auth0 = setup();

      auth0.logout({ localOnly: true });

      expect(esCookie.remove).toHaveBeenCalledWith(
        `auth0.${TEST_CLIENT_ID}.is.authenticated`, {}
      );
    });

    it('removes the organization hint cookie from storage when `options.localOnly` is true', async () => {
      const auth0 = setup();

      auth0.logout({ localOnly: true });

      expect(esCookie.remove).toHaveBeenCalledWith(
        `auth0.${TEST_CLIENT_ID}.organization_hint`, {}
      );
    });

    it('skips `window.location.assign` when `options.localOnly` is true', async () => {
      const auth0 = setup();

      auth0.logout({ localOnly: true });

      expect(window.location.assign).not.toHaveBeenCalledWith();
    });

    it('calls `window.location.assign` when `options.localOnly` is false', async () => {
      const auth0 = setup();

      auth0.logout({ localOnly: false });
      expect(window.location.assign).toHaveBeenCalled();
    });

    it('throws when both `options.localOnly` and `options.federated` are true', async () => {
      const auth0 = setup();

      const fn = () => auth0.logout({ localOnly: true, federated: true });
      expect(fn).toThrow();
    });

    it('can access isAuthenticated immediately after local logout', async () => {
      const auth0 = setup();

      await loginWithRedirect(auth0);
      expect(await auth0.isAuthenticated()).toBe(true);
      auth0.logout({ localOnly: true });

      expect(await auth0.isAuthenticated()).toBe(false);
    });

    it('can access isAuthenticated immediately after local logout when using a custom async cache', async () => {
      const auth0 = setup({
        cache: new InMemoryAsyncCacheNoKeys()
      });

      await loginWithRedirect(auth0);
      expect(await auth0.isAuthenticated()).toBe(true);
      await auth0.logout({ localOnly: true });

      expect(await auth0.isAuthenticated()).toBe(false);
    });
  });
});
