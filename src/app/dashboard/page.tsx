'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  BarChart3, 
  ShoppingBag, 
  DollarSign, 
  Users,
  Package,
  Settings,
  LogOut,
  TrendingUp,
  CreditCard,
  Activity,
  Store,
  Link as LinkIcon,
  FileText,
  Bell
} from 'lucide-react';

export default function MerchantDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Mock stats data
  const [stats, setStats] = useState({
    totalOrders: 156,
    revenue: 45230.50,
    customers: 89,
    products: 234,
    orderGrowth: 15.3,
    revenueGrowth: 22.5,
    conversionRate: 4.2,
    avgOrderValue: 290.07
  });

  // Mock recent orders
  const recentOrders = [
    { id: 'ORD-001', customer: 'AI Agent #123', product: 'Wireless Headphones', amount: 129.99, status: 'completed', time: '5 min ago' },
    { id: 'ORD-002', customer: 'AI Agent #456', product: 'Smart Watch', amount: 299.99, status: 'processing', time: '15 min ago' },
    { id: 'ORD-003', customer: 'AI Agent #789', product: 'Laptop Stand', amount: 49.99, status: 'completed', time: '1 hour ago' },
    { id: 'ORD-004', customer: 'AI Agent #234', product: 'USB-C Hub', amount: 79.99, status: 'pending', time: '2 hours ago' },
  ];

  // Mock products
  const topProducts = [
    { name: 'Wireless Headphones', sales: 45, revenue: 5849.55, stock: 23 },
    { name: 'Smart Watch', sales: 32, revenue: 9599.68, stock: 15 },
    { name: 'Laptop Stand', sales: 28, revenue: 1399.72, stock: 45 },
    { name: 'USB-C Hub', sales: 21, revenue: 1679.79, stock: 67 },
  ];

  useEffect(() => {
    const token = localStorage.getItem('merchant_token');
    const userData = localStorage.getItem('merchant_user');
    
    if (!token) {
      router.push('/login');
      return;
    }
    
    if (userData) {
      setUser(JSON.parse(userData));
    }
    
    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('merchant_token');
    localStorage.removeItem('merchant_user');
    router.push('/login');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Store className="w-8 h-8 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">Merchant Dashboard</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <button className="relative p-2 text-gray-500 hover:text-gray-700">
                <Bell className="w-5 h-5" />
                <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-white"></span>
              </button>
              
              <div className="flex items-center space-x-3 pl-4 border-l">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.store_name || 'My Store'}</p>
                  <p className="text-xs text-gray-500">{user?.email || 'merchant@store.com'}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'orders', label: 'Orders', icon: ShoppingBag },
              { id: 'products', label: 'Products', icon: Package },
              { id: 'integration', label: 'Integration', icon: LinkIcon },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {activeTab === 'overview' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalOrders}</p>
                    <div className="flex items-center mt-2">
                      <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                      <span className="text-sm text-green-600">+{stats.orderGrowth}%</span>
                    </div>
                  </div>
                  <ShoppingBag className="w-8 h-8 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.revenue)}</p>
                    <div className="flex items-center mt-2">
                      <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                      <span className="text-sm text-green-600">+{stats.revenueGrowth}%</span>
                    </div>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Customers</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.customers}</p>
                    <p className="text-sm text-gray-500 mt-2">AI Agents</p>
                  </div>
                  <Users className="w-8 h-8 text-purple-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Products</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.products}</p>
                    <p className="text-sm text-gray-500 mt-2">Active</p>
                  </div>
                  <Package className="w-8 h-8 text-orange-500" />
                </div>
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Conversion Rate</h3>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-bold text-gray-900">{stats.conversionRate}%</span>
                  <span className="text-sm text-green-600">+0.5% from last week</span>
                </div>
                <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ width: `${stats.conversionRate * 10}%` }}
                  />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Avg Order Value</h3>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-bold text-gray-900">{formatCurrency(stats.avgOrderValue)}</span>
                  <span className="text-sm text-green-600">+12% from last week</span>
                </div>
                <Activity className="w-8 h-8 text-blue-500 mt-2" />
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment Success</h3>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-bold text-gray-900">98.5%</span>
                  <span className="text-sm text-gray-600">via Stripe</span>
                </div>
                <CreditCard className="w-8 h-8 text-purple-500 mt-2" />
              </div>
            </div>

            {/* Recent Orders Table */}
            <div className="bg-white rounded-lg shadow mb-8">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold">Recent Orders</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{order.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{order.customer}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{order.product}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatCurrency(order.amount)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            order.status === 'completed' ? 'bg-green-100 text-green-800' :
                            order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Products */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold">Top Products</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {topProducts.map((product, i) => (
                    <div key={i} className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{product.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{product.sales} sales • {product.stock} in stock</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(product.revenue)}</p>
                        <p className="text-xs text-gray-500">Revenue</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'orders' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Orders Management</h2>
            <p className="text-gray-600">View and manage all your orders from AI agents.</p>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Products Catalog</h2>
            <p className="text-gray-600">Manage your product inventory and sync with your store.</p>
          </div>
        )}

        {activeTab === 'integration' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">API Integration</h2>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">Your API Key</h3>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 px-3 py-2 bg-white border rounded text-sm font-mono">
                    pk_live_51234567890abcdef
                  </code>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
                    Copy
                  </button>
                </div>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Connected Services</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <span className="text-sm font-medium">Shopify Store</span>
                    <span className="text-xs text-green-600 font-medium">✓ Connected</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <span className="text-sm font-medium">Stripe Payments</span>
                    <span className="text-xs text-green-600 font-medium">✓ Connected</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Settings</h2>
            <p className="text-gray-600">Configure your merchant account and preferences.</p>
          </div>
        )}
      </main>
    </div>
  );
}
