export default {
  async rewrites() {
    return [
      {
        source: '/api/v1/auth/:path*',
        destination: (process.env.API_ORIGIN || 'http://127.0.0.1:8000') + '/api/v1/auth/:path*'
      }
    ]
  }
}
