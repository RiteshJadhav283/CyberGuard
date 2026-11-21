export default {
  async rewrites() {
    return [{source: '/api/:path*', destination: (process.env.API_ORIGIN || 'http://api:8000') + '/api/:path*'}]
  }
}
