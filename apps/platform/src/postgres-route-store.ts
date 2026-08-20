/** PostgreSQL RelayRouteStore shared by every Platform Instance. */

import type { RelayRouteStore } from '@deepseek-ai/dsh-remote-access'
import type { RelayRouteId } from '@deepseek-ai/dsh-remote-protocol'
import type { PlatformSqlClient, PlatformSqlPool } from './postgres-pairing-store.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS remote_access_routes (
  database_identity text NOT NULL,
  route_id text NOT NULL,
  revision integer NOT NULL,
  revoked boolean NOT NULL,
  PRIMARY KEY (database_identity, route_id)
);
CREATE TABLE IF NOT EXISTS remote_access_route_authorities (
  database_identity text NOT NULL,
  route_id text NOT NULL,
  endpoint text NOT NULL,
  digest bytea NOT NULL,
  PRIMARY KEY (database_identity, route_id, endpoint, digest)
);
`

interface RouteRow {
  revision: number
  revoked: boolean
}

/** Durable content-free Relay route authorization. */
export class PostgresRelayRouteStore implements RelayRouteStore {
  /**
   * @param databaseIdentity - deployment database identity bound to this store.
   * @param pool - shared connection pool.
   */
  constructor(
    readonly databaseIdentity: string,
    private readonly pool: PlatformSqlPool,
  ) {}

  /** Create route-authorization tables if they are absent. */
  async migrate(): Promise<void> {
    await this.pool.query(SCHEMA)
  }

  async rotate(
    routeId: RelayRouteId,
    endpoint: 'mobile' | 'desktop',
    credentialDigest: Uint8Array,
  ): Promise<number> {
    return await this.transact(async (client) => {
      const current = await this.loadRoute(client, routeId)
      const revision = (current?.revision ?? 0) + 1
      await this.upsertRoute(client, routeId, revision, false)
      await client.query(
        `DELETE FROM remote_access_route_authorities
          WHERE database_identity = $1 AND route_id = $2 AND endpoint = $3`,
        [this.databaseIdentity, routeId, endpoint],
      )
      await this.insertAuthority(client, routeId, endpoint, credentialDigest)
      return revision
    })
  }

  async issue(
    routeId: RelayRouteId,
    endpoint: 'mobile' | 'desktop',
    credentialDigest: Uint8Array,
  ): Promise<number | undefined> {
    return await this.transact(async (client) => {
      const current = await this.loadRoute(client, routeId)
      if (current === undefined || current.revoked) return undefined
      await this.insertAuthority(client, routeId, endpoint, credentialDigest)
      return current.revision
    })
  }

  async authorize(
    routeId: RelayRouteId,
    endpoint: 'mobile' | 'desktop',
    credentialDigest: Uint8Array,
  ): Promise<number | undefined> {
    const route = await this.pool.query(
      `SELECT revision, revoked
         FROM remote_access_routes
        WHERE database_identity = $1 AND route_id = $2`,
      [this.databaseIdentity, routeId],
    )
    const current = asRouteRow(route.rows[0])
    if (current === undefined || current.revoked) return undefined
    const authority = await this.pool.query(
      `SELECT 1
         FROM remote_access_route_authorities
        WHERE database_identity = $1 AND route_id = $2 AND endpoint = $3 AND digest = $4`,
      [this.databaseIdentity, routeId, endpoint, Buffer.from(credentialDigest)],
    )
    return authority.rows[0] === undefined ? undefined : current.revision
  }

  async revokeCredential(
    routeId: RelayRouteId,
    endpoint: 'mobile' | 'desktop',
    credentialDigest: Uint8Array,
  ): Promise<number> {
    return await this.transact(async (client) => {
      const current = await this.loadRoute(client, routeId)
      const revision = (current?.revision ?? 0) + 1
      const revoked = current?.revoked ?? true
      await this.upsertRoute(client, routeId, revision, revoked)
      await client.query(
        `DELETE FROM remote_access_route_authorities
          WHERE database_identity = $1 AND route_id = $2 AND endpoint = $3 AND digest = $4`,
        [this.databaseIdentity, routeId, endpoint, Buffer.from(credentialDigest)],
      )
      return revision
    })
  }

  async revoke(routeId: RelayRouteId): Promise<number> {
    return await this.transact(async (client) => {
      const current = await this.loadRoute(client, routeId)
      const revision = (current?.revision ?? 0) + 1
      await this.upsertRoute(client, routeId, revision, true)
      await client.query(
        `DELETE FROM remote_access_route_authorities
          WHERE database_identity = $1 AND route_id = $2`,
        [this.databaseIdentity, routeId],
      )
      return revision
    })
  }

  private async transact<T>(operation: (client: PlatformSqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* rollback after a failed BEGIN is best-effort */
      }
      throw error
    } finally {
      client.release()
    }
  }

  private async loadRoute(client: PlatformSqlClient, routeId: RelayRouteId): Promise<RouteRow | undefined> {
    const result = await client.query(
      `SELECT revision, revoked
         FROM remote_access_routes
        WHERE database_identity = $1 AND route_id = $2
        FOR UPDATE`,
      [this.databaseIdentity, routeId],
    )
    return asRouteRow(result.rows[0])
  }

  private async upsertRoute(
    client: PlatformSqlClient,
    routeId: RelayRouteId,
    revision: number,
    revoked: boolean,
  ): Promise<void> {
    await client.query(
      `INSERT INTO remote_access_routes (database_identity, route_id, revision, revoked)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (database_identity, route_id) DO UPDATE
         SET revision = EXCLUDED.revision, revoked = EXCLUDED.revoked`,
      [this.databaseIdentity, routeId, revision, revoked],
    )
  }

  private async insertAuthority(
    client: PlatformSqlClient,
    routeId: RelayRouteId,
    endpoint: 'mobile' | 'desktop',
    credentialDigest: Uint8Array,
  ): Promise<void> {
    await client.query(
      `INSERT INTO remote_access_route_authorities (database_identity, route_id, endpoint, digest)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (database_identity, route_id, endpoint, digest) DO NOTHING`,
      [this.databaseIdentity, routeId, endpoint, Buffer.from(credentialDigest)],
    )
  }
}

function asRouteRow(value: Record<string, unknown> | undefined): RouteRow | undefined {
  return value as RouteRow | undefined
}
