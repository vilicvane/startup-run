import {spawn} from 'child_process';
import {dirname, join, resolve} from 'path';
import {fileURLToPath} from 'url';

import FSExtra from 'fs-extra';

import {DaemonInstance, type DaemonOptions} from './daemon.js';

export const DAEMON_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../daemon/main.js',
);

export const RESPAWN_DELAY = 1000;

export type StartupRunOptions = {
  /**
   * Command to run, defaults to `process.execPath`.
   */
  command?: string;
  /**
   * Arguments for command, defaults to `process.argv.slice(1)`.
   */
  args?: string[];
  /**
   * Current working directory, defaults to `process.cwd()`.
   */
  cwd?: string;
  /**
   * Environment variables, defaults to `{}`.
   */
  env?: Record<string, string>;
  /**
   * Log file path, defaults to `true` and `true` defaults to "<name>.log".
   */
  log?: boolean | string;
  /**
   * Respawn on exit, defaults to `true` and `true` defaults to 1000 ms.
   */
  respawn?: boolean | number;
};

export abstract class StartupRun {
  readonly command: string;

  readonly name: string;

  readonly args: string[];

  readonly cwd: string;

  readonly env: Record<string, string>;

  readonly log: string | false;

  readonly respawn: number | false;

  constructor(
    /**
     * Name of the startup run instance, used as identifier.
     */
    name: string,
    {
      command = process.execPath,
      args = process.argv.slice(1),
      cwd = process.cwd(),
      env = {},
      log = true,
      respawn = true,
    }: StartupRunOptions = {},
  ) {
    cwd = resolve(cwd);

    if (respawn === true) {
      respawn = RESPAWN_DELAY;
    }

    if (log === true) {
      log = `${name}.log`;
    }

    if (typeof log === 'string') {
      log = resolve(cwd, log);
    }

    this.name = name;
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.log = log;
    this.respawn = respawn;
  }

  abstract enable(): Promise<void>;

  abstract disable(): Promise<void>;

  abstract isEnabled(): Promise<boolean>;

  async start(): Promise<void> {
    if (StartupRun.daemonSpawned) {
      throw new Error(
        'Process spawned by startup-run daemon cannot start daemon process.',
      );
    }

    const [command, ...args] = this.buildCommandSegments();

    spawn(command, args, {detached: true}).unref();
  }

  async stop(): Promise<void> {
    const instance = new DaemonInstance(this.name);

    await instance.kill();
  }

  async setup({
    enable = false,
    disable = false,
  }: StartupRunSetupOptions): Promise<void> {
    if (StartupRun.daemonSpawned) {
      return;
    }

    if (enable) {
      await this.enable();
      await this.start();

      process.exit();
    } else if (disable) {
      await this.stop();
      await this.disable();

      process.exit();
    } else {
      await this.stop();
    }
  }

  protected async validate(): Promise<void> {
    const {log} = this;

    if (typeof log === 'string') {
      try {
        await FSExtra.ensureFile(log);
      } catch (error) {
        console.error('Failed to ensure log file:');
        console.error(`  ${log}`);

        throw error;
      }
    }
  }

  protected buildCommandSegments(): string[] {
    const {name, command, args, cwd, env, log, respawn} = this;

    return [
      process.execPath,
      DAEMON_PATH,
      Buffer.from(
        JSON.stringify({
          name,
          command,
          args,
          cwd,
          env,
          log,
          respawn,
        } satisfies DaemonOptions),
      ).toString('base64'),
    ];
  }

  static daemonSpawned =
    Number(process.env.STARTUP_RUN_DAEMON) === process.ppid;

  static create: (name: string, options?: StartupRunOptions) => StartupRun =
    () => {
      throw new Error('Not implemented.');
    };
}

export type StartupRunSetupOptions = {
  enable?: boolean;
  disable?: boolean;
};
