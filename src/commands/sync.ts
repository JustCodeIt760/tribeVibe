import { pushCommand } from './push.js';
import { pullCommand } from './pull.js';
import chalk from 'chalk';

export async function syncCommand(): Promise<void> {
  console.log(chalk.bold('Syncing...'));
  await pushCommand();
  await pullCommand();
}
