import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {promisify} from 'util';

import {commandJoin} from 'command-join';
import WinReg from 'winreg';

import {StartupRun} from '../startup-run.js';

const HIDEEXEC_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../bin/hideexec.exe',
);

export class WindowsStartupRun extends StartupRun {
  private reg = new WinReg({
    hive: WinReg.HKCU,
    key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  });

  override async enable(): Promise<void> {
    await this.validate();

    const {name, reg} = this;

    const segments = this.buildCommandSegments();

    const line = commandJoin(segments);

    await promisify(reg.set.bind(reg))(name, WinReg.REG_SZ, line);
  }

  override async disable(): Promise<void> {
    const {name, reg} = this;

    if (!(await this.isEnabled())) {
      return;
    }

    await promisify(reg.remove.bind(reg))(name);
  }

  override async isEnabled(): Promise<boolean> {
    const {name, reg} = this;

    return promisify(reg.valueExists.bind(reg))(name);
  }

  protected override buildCommandSegments(): string[] {
    return [HIDEEXEC_PATH, ...super.buildCommandSegments()];
  }
}
