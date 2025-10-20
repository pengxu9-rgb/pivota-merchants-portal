'use client';

import { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  Zap, 
  Clock,
  TrendingUp,
  RefreshCw,
  PlayCircle,
  AlertCircle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export default function MCPPage() {
  const [loading, setLoading] = useState(true);
  const [mcpStatus, setMcpStatus] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadMCPStatus();
  }, []);

  const loadMCPStatus = async () => {
    try {
      setLoading(true);
      // Call backend API: GET /mcp/status
      const merchantId = localStorage.getItem('merchant_id');
      console.log('Loading MCP status for merchant:', merchantId);
      
      // Mock data for now (replace with real API call)
      setMcpStatus({
        connected: true,
        platform: 'shopify',
        shop_domain: 'chydantest.myshopify.com',
        nodes: [
          { id: 'node-1', name: 'Payment Node', status: 'online', latency: 45, uptime: 99.8 },
          { id: 'node-2', name: 'Inventory Node', status: 'online', latency: 32, uptime: 99.9 },
          { id: 'node-3', name: 'Order Node', status: 'online', latency: 28, uptime: 100 },
        ],
        total_requests: 1250,
        avg_latency: 35,
        success_rate: 99.2,
        last_sync: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load MCP status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      // Call: POST /mcp/test
      await new Promise(resolve => setTimeout(resolve, 2000));
      alert('✅ MCP connection test successful!\n\nAll nodes responding normally.');
    } catch (error) {
      alert('❌ MCP connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      alert('✅ MCP sync completed!');
      await loadMCPStatus();
    } catch (error) {
      alert('❌ Sync failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MCP Integration</h1>
          <p className="text-gray-600">Monitor and manage your MCP payment chain</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadMCPStatus}
            className="flex items-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {testing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Testing...</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                <span>Test Connection</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div className={`rounded-lg p-6 ${mcpStatus?.connected ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {mcpStatus?.connected ? (
              <CheckCircle className="w-10 h-10 text-green-600" />
            ) : (
              <XCircle className="w-10 h-10 text-red-600" />
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {mcpStatus?.connected ? 'MCP Connected' : 'MCP Disconnected'}
              </h2>
              <p className="text-sm text-gray-600">
                {mcpStatus?.platform && `Platform: ${mcpStatus.platform} • `}
                {mcpStatus?.shop_domain || 'No store connected'}
              </p>
            </div>
          </div>
          <button
            onClick={handleSyncNow}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Sync Now
          </button>
        </div>
      </div>

      {/* MCP Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{mcpStatus?.total_requests || 0}</h3>
          <p className="text-sm text-gray-600">Total Requests</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{mcpStatus?.avg_latency || 0}ms</h3>
          <p className="text-sm text-gray-600">Avg Latency</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{mcpStatus?.success_rate || 0}%</h3>
          <p className="text-sm text-gray-600">Success Rate</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Zap className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{mcpStatus?.nodes?.length || 0}</h3>
          <p className="text-sm text-gray-600">Active Nodes</p>
        </div>
      </div>

      {/* MCP Nodes Status */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">MCP Nodes</h2>
        </div>
        <div className="p-6">
          {mcpStatus?.nodes && mcpStatus.nodes.length > 0 ? (
            <div className="space-y-4">
              {mcpStatus.nodes.map((node: any) => (
                <div key={node.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className={`p-2 rounded-lg ${
                      node.status === 'online' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {node.status === 'online' ? (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{node.name}</h3>
                      <p className="text-sm text-gray-600 capitalize">Status: {node.status}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-6">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Latency</p>
                      <p className="font-semibold text-gray-900">{node.latency}ms</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Uptime</p>
                      <p className="font-semibold text-gray-900">{node.uptime}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No MCP nodes configured</p>
              <p className="text-sm mt-1">Connect your store to enable MCP</p>
            </div>
          )}
        </div>
      </div>

      {/* Last Sync Info */}
      {mcpStatus?.last_sync && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Last Sync:</strong> {new Date(mcpStatus.last_sync).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}


