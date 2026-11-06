/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['node:sqlite', 'pg', '@prisma/client', '@prisma/adapter-pg'],
};

export default nextConfig;
