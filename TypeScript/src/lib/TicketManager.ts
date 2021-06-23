import { UserAuthTicket } from './AuthClient'
import AuthClient from './AuthClient';

export interface TicketStorageManager {
  ticketFetcher: (client: AuthClient) => Promise<UserAuthTicket>;
  onTicketChanged: (ticket: UserAuthTicket) => void;
  onTicketRefreshed: (ticket: UserAuthTicket) => void;
}

export interface TicketManagerOptions {
  authClient: AuthClient;
  storageManager: TicketStorageManager;
  ticket?: UserAuthTicket;
}

export default class TicketManager {
  /// Private Fields
  private _authClient: AuthClient;
  private _authTicket: UserAuthTicket | undefined;
  private _storageManager: TicketStorageManager;
  private _ticketFetcherPromise: Promise<UserAuthTicket> | undefined;
  private _ticketRefreshPromise: Promise<UserAuthTicket> | undefined;

  constructor(options: TicketManagerOptions) {
    this._authClient = options.authClient;
    this._storageManager = options.storageManager;
    if (options.ticket) {
      this.setTicket(options.ticket);
    }
  }

  /// Private Methods
  private _validateTicket: (authTicket: UserAuthTicket) => void = (authTicket) => {
    if (!authTicket.accessToken ||
        !authTicket.refreshToken ||
        !authTicket.jwtAccessToken) throw new Error('Invalid auth ticket!');
  }

  private _performTicketFetch: () => Promise<UserAuthTicket> = async () => {
    if (!this._storageManager?.ticketFetcher) return Promise.reject('No implementation for ticketFetcher provided.');
    if (!this._authClient) return Promise.reject('No implementation for AuthClient provided.');

    if (this._ticketFetcherPromise) return this._ticketFetcherPromise;
    this._ticketFetcherPromise = this._storageManager.ticketFetcher(this._authClient);
    return this._ticketFetcherPromise.then(resp => {
      this._ticketFetcherPromise = undefined;
      return resp;
    }).catch(err => {
      this._ticketFetcherPromise = undefined;
      throw err;
    })
  }

  private _performTicketRefresh: (authTicket: UserAuthTicket) => Promise<UserAuthTicket> = async (authTicket) => {
    if (!this._authClient) return Promise.reject('No implementation for AuthClient provided.');

    if (this._ticketRefreshPromise) return this._ticketRefreshPromise;
    this._ticketRefreshPromise = this._authClient.refreshUserAuth(authTicket);
    return this._ticketRefreshPromise.then(resp => {
      this._ticketRefreshPromise = undefined;
      return resp;
    }).catch(err => {
      this._ticketRefreshPromise = undefined;
      throw err;
    })
  }

  private _refreshTicket: (authTicket?: UserAuthTicket) => Promise<UserAuthTicket> = async authTicket => {
    if (!this._authClient) return Promise.reject('No implementation for AuthClient provided.');

    const refresh = (authTicket !== null && authTicket !== undefined && authTicket.refreshToken && new Date() < authTicket.refreshTokenExpiration);

    const newTicketPromise = refresh && authTicket !== null && authTicket !== undefined ?
      this._performTicketRefresh(authTicket) :
      this._performTicketFetch();
    return newTicketPromise.then(ticket => {
      this._authTicket = ticket;

      if (this._storageManager?.onTicketRefreshed) this._storageManager.onTicketRefreshed(ticket);

      return ticket;
    }).then(ticket => {
      return this.setTicket(ticket);
    })
  }

  /// Public Methods
  setTicket: (authTicket: UserAuthTicket) => UserAuthTicket = authTicket => {
    this._validateTicket(authTicket);
    this._authTicket = authTicket;
    this._storageManager?.onTicketChanged?.(authTicket);
    return authTicket;
  }

  getTicket: () => Promise<UserAuthTicket> = async () => {
    if (this._authTicket && !TicketManager.isTicketExpired(this._authTicket)) return Promise.resolve(this._authTicket);
    return this._refreshTicket(this._authTicket);
  }

  getToken: () => Promise<string> = async () => {
    return this.getTicket().then(ticket => {
      return ticket.accessToken || '';
    })
  }

  invalidateTicket: () => void = () => {
    this._authTicket = undefined;
  }

  /// Static Methods
  static isTicketExpired: (authTicket: UserAuthTicket) => boolean = (authTicket) => {
    return !authTicket || !authTicket.accessToken || !authTicket.accessTokenExpiration || new Date() > authTicket.accessTokenExpiration;
  }
}