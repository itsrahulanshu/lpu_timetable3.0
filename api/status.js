// api/status.js - Serverless function for status endpoint
const handler = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      status: 'running',
      version: process.env.PWA_VERSION || '1.9.4',
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

module.exports = handler;
