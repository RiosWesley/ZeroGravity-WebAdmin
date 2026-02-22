import { promises as fs } from 'fs';
import path from 'path';

const ACCOUNTS_FILE_PATH = '/home/wesley/.config/zerogravity/accounts.json';

export async function readAccountsFile() {
  try {
    const data = await fs.readFile(ACCOUNTS_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

export async function writeAccountsFile(accountsData) {
  try {
    // ensure dir exists
    await fs.mkdir(path.dirname(ACCOUNTS_FILE_PATH), { recursive: true });
    await fs.writeFile(ACCOUNTS_FILE_PATH, JSON.stringify(accountsData, null, 2), 'utf8');
    return true;
  } catch (err) {
    throw err;
  }
}
