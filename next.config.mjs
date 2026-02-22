import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix dockerode / ssh2 issue by telling Next to treat them as external node modules
  serverExternalPackages: ['dockerode', 'ssh2', 'cpu-features'],
};

export default nextConfig;
