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
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">Orders Management</h2>
              <div className="flex items-center space-x-2">
                <select className="px-3 py-2 border rounded-lg text-sm">
                  <option>All Status</option>
                  <option>Completed</option>
                  <option>Processing</option>
                  <option>Pending</option>
                  <option>Cancelled</option>
                </select>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  Export CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Products</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {[
                    { id: 'ORD-001', customer: 'AI Agent #123', products: 2, amount: 129.99, status: 'completed', date: '2025-10-18', time: '10:30 AM' },
                    { id: 'ORD-002', customer: 'AI Agent #456', products: 1, amount: 299.99, status: 'processing', date: '2025-10-18', time: '10:15 AM' },
                    { id: 'ORD-003', customer: 'AI Agent #789', products: 3, amount: 149.97, status: 'completed', date: '2025-10-18', time: '09:45 AM' },
                    { id: 'ORD-004', customer: 'AI Agent #234', products: 1, amount: 79.99, status: 'pending', date: '2025-10-18', time: '09:20 AM' },
                    { id: 'ORD-005', customer: 'AI Agent #567', products: 4, amount: 459.96, status: 'completed', date: '2025-10-17', time: '11:50 PM' },
                    { id: 'ORD-006', customer: 'AI Agent #890', products: 2, amount: 189.98, status: 'processing', date: '2025-10-17', time: '10:30 PM' },
                  ].map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{order.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{order.customer}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{order.products} items</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{formatCurrency(order.amount)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          order.status === 'completed' ? 'bg-green-100 text-green-800' :
                          order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{order.date}</div>
                        <div className="text-xs text-gray-500">{order.time}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button className="text-blue-600 hover:text-blue-800 font-medium">View Details</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing 1 to 6 of 156 orders
              </div>
              <div className="flex items-center space-x-2">
                <button className="px-3 py-1 border rounded text-sm hover:bg-gray-50">Previous</button>
                <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm">1</button>
                <button className="px-3 py-1 border rounded text-sm hover:bg-gray-50">2</button>
                <button className="px-3 py-1 border rounded text-sm hover:bg-gray-50">3</button>
                <button className="px-3 py-1 border rounded text-sm hover:bg-gray-50">Next</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">Products Catalog</h2>
              <div className="flex items-center space-x-2">
                <button className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                  <LinkIcon className="w-4 h-4 inline mr-1" />
                  Sync from Shopify
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  + Add Product
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { id: 1, name: 'Wireless Headphones', price: 129.99, stock: 23, image: '🎧', sales: 45, status: 'active' },
                  { id: 2, name: 'Smart Watch', price: 299.99, stock: 15, image: '⌚', sales: 32, status: 'active' },
                  { id: 3, name: 'Laptop Stand', price: 49.99, stock: 45, image: '💻', sales: 28, status: 'active' },
                  { id: 4, name: 'USB-C Hub', price: 79.99, stock: 67, image: '🔌', sales: 21, status: 'active' },
                  { id: 5, name: 'Wireless Mouse', price: 59.99, stock: 8, image: '🖱️', sales: 18, status: 'low_stock' },
                  { id: 6, name: 'Keyboard', price: 149.99, stock: 0, image: '⌨️', sales: 15, status: 'out_of_stock' },
                ].map((product) => (
                  <div key={product.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-5xl">{product.image}</div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        product.status === 'active' ? 'bg-green-100 text-green-700' :
                        product.status === 'low_stock' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {product.status === 'active' ? 'In Stock' :
                         product.status === 'low_stock' ? 'Low Stock' :
                         'Out of Stock'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">{product.name}</h3>
                    <div className="flex items-baseline justify-between mb-3">
                      <span className="text-2xl font-bold text-gray-900">{formatCurrency(product.price)}</span>
                      <span className="text-sm text-gray-600">{product.stock} in stock</span>
                    </div>
                    <div className="text-sm text-gray-600 mb-4">
                      {product.sales} sales this month
                    </div>
                    <div className="flex space-x-2">
                      <button className="flex-1 px-3 py-2 border rounded text-sm hover:bg-gray-50">
                        Edit
                      </button>
                      <button className="flex-1 px-3 py-2 border rounded text-sm hover:bg-gray-50">
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t">
              <div className="text-sm text-gray-600">
                Showing 6 of {stats.products} products
              </div>
            </div>
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
          <div className="space-y-6">
            {/* Store Information */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-xl font-semibold">Store Information</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Business Name</label>
                  <input
                    type="text"
                    defaultValue={user?.store_name || 'My Store'}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Email</label>
                  <input
                    type="email"
                    defaultValue={user?.email || 'merchant@store.com'}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    defaultValue="+1 (555) 123-4567"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Store URL</label>
                  <input
                    type="url"
                    defaultValue="https://mystore.com"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Save Changes
                </button>
              </div>
            </div>

            {/* Payment Settings */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-xl font-semibold">Payment Settings</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <CreditCard className="w-8 h-8 text-purple-600" />
                      <div>
                        <h3 className="font-medium text-gray-900">Stripe</h3>
                        <p className="text-sm text-gray-600">Primary payment processor</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      Connected
                    </span>
                  </div>
                  <button className="text-sm text-blue-600 hover:text-blue-800">
                    Manage Stripe Settings →
                  </button>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <CreditCard className="w-8 h-8 text-gray-400" />
                      <div>
                        <h3 className="font-medium text-gray-900">PayPal</h3>
                        <p className="text-sm text-gray-600">Additional payment option</p>
                      </div>
                    </div>
                    <button className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg text-sm hover:bg-blue-50">
                      Connect
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* API Access */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-xl font-semibold">API Access</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your API Key</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value="pk_live_51234567890abcdef"
                      readOnly
                      className="flex-1 px-3 py-2 bg-gray-50 border rounded-lg font-mono text-sm"
                    />
                    <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                      Copy
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    Keep your API key secure. Do not share it publicly.
                  </p>
                </div>
                <button className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
                  Regenerate API Key
                </button>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-xl font-semibold">Notification Preferences</h2>
              </div>
              <div className="p-6 space-y-4">
                {[
                  { label: 'New Order Notifications', description: 'Get notified when you receive a new order', checked: true },
                  { label: 'Low Stock Alerts', description: 'Alert when products are running low', checked: true },
                  { label: 'Payment Updates', description: 'Notifications about payment status changes', checked: true },
                  { label: 'Weekly Reports', description: 'Receive weekly performance summaries', checked: false },
                ].map((pref, i) => (
                  <label key={i} className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked={pref.checked}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{pref.label}</div>
                      <div className="text-sm text-gray-600">{pref.description}</div>
                    </div>
                  </label>
                ))}
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Save Preferences
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

