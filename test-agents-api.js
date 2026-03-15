// Test script to verify OpenCode SDK connection
import { createOpencodeClient } from '@opencode-ai/sdk';

async function testOpenCodeAPIs() {
  try {
    console.log('🔍 Testing OpenCode SDK connection...\n');
    
    const client = createOpencodeClient({
      baseUrl: 'http://127.0.0.1:4100',
    });
    
    // Test 1: global.health() - should work
    console.log('1️⃣ Testing global.health()...');
    try {
      const health = await client.global.health();
      console.log('✅ Health check passed!');
      console.log('   Response:', JSON.stringify(health, null, 2));
    } catch (err) {
      console.error('❌ Health check failed:', err.message);
    }
    
    // Test 2: config.get() - should work
    console.log('\n2️⃣ Testing config.get()...');
    try {
      const config = await client.config.get();
      console.log('✅ Config retrieved!');
      console.log('   Model:', config.data?.model || 'N/A');
      console.log('   Has agent config:', !!config.data?.agent);
      if (config.data?.agent) {
        const agentIds = Object.keys(config.data.agent);
        console.log('   Agents in config:', agentIds.join(', '));
      }
    } catch (err) {
      console.error('❌ Config failed:', err.message);
    }
    
    // Test 3: app.log() - should work
    console.log('\n3️⃣ Testing app.log()...');
    try {
      const logResult = await client.app.log({
        body: {
          service: 'test-script',
          level: 'info',
          message: 'Testing OpenCode SDK',
        },
      });
      console.log('✅ Log written!');
      console.log('   Response:', JSON.stringify(logResult, null, 2));
    } catch (err) {
      console.error('❌ Log failed:', err.message);
    }
    
    // Test 4: app.agents() - might not work
    console.log('\n4️⃣ Testing app.agents()...');
    try {
      const agents = await client.app.agents();
      console.log('✅ Agents retrieved!');
      console.log('   Response:', JSON.stringify(agents, null, 2));
    } catch (err) {
      console.error('❌ Agents failed:', err.message);
    }
    
    console.log('\n✅ Tests completed!');
    
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    console.error('Stack:', err.stack);
  }
}

testOpenCodeAPIs();
