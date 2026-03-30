'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, Download, Search, Filter, Truck, DollarSign } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useMerchantLanguage } from '@/components/portal/merchant-language-provider';
import RefundDialog from '@/components/RefundDialog';
import {
  MerchantButton,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/merchant-primitives';

export default function OrdersPage() {
  const { t } = useMerchantLanguage();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [itemsPerPage] = useState(50);
  
  // Shipping state
  const [showShippingForm, setShowShippingForm] = useState(false);
  const [shippingData, setShippingData] = useState({ tracking_number: '', carrier: '' });
  const [shippingLoading, setShippingLoading] = useState(false);
  
  // Refund state
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundHistory, setRefundHistory] = useState<any[]>([]);
  const [afterSalesCases, setAfterSalesCases] = useState<any[]>([]);
  const [afterSalesLoading, setAfterSalesLoading] = useState(false);
  const [approvingCaseId, setApprovingCaseId] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, [currentPage, statusFilter]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * itemsPerPage;
      const params: any = { limit: itemsPerPage, offset };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      const data = await apiClient.getOrders(params);
      setOrders(data.orders || []);
      setTotalOrders(data.total || 0);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewOrder = async (orderId: string) => {
    try {
      const orderDetails = await apiClient.getOrderDetails(orderId);
      await openOrderModal(orderDetails);
    } catch (error) {
      console.error('Failed to load order:', error);
      alert('Failed to load order details');
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const result = await apiClient.exportOrders();
      alert(result.message || 'Export started. You will receive an email when ready.');
    } catch (error: any) {
      console.error('Export failed:', error);
      alert(error.response?.data?.detail || 'Failed to export orders');
    } finally {
      setExporting(false);
    }
  };
  
  const handleMarkShipped = async () => {
    if (!shippingData.tracking_number || !shippingData.carrier) {
      alert('Please enter tracking number and carrier');
      return;
    }
    
    setShippingLoading(true);
    try {
      const orderId = selectedOrder.data?.order_id || selectedOrder.order_id;
      await apiClient.markOrderShipped(orderId, shippingData.tracking_number, shippingData.carrier);
      alert('Order marked as shipped!');
      setShowShippingForm(false);
      setShowOrderModal(false);
      loadOrders(); // Refresh list
    } catch (error: any) {
      console.error('Failed to mark shipped:', error);
      alert(error.response?.data?.detail || 'Failed to mark order as shipped');
    } finally {
      setShippingLoading(false);
    }
  };
  
  const loadRefundHistory = async (orderId: string) => {
    try {
      const result = await apiClient.getOrderRefunds(orderId);
      setRefundHistory(result.refunds || []);
    } catch (error: any) {
      console.error('Failed to load refund history:', error);
      setRefundHistory([]);
    }
  };

  const loadAfterSalesCases = async (orderId: string) => {
    try {
      setAfterSalesLoading(true);
      const result = await apiClient.getOrderAfterSalesCases(orderId);
      setAfterSalesCases(result.cases || []);
    } catch (error: any) {
      console.error('Failed to load after-sales cases:', error);
      setAfterSalesCases([]);
    } finally {
      setAfterSalesLoading(false);
    }
  };

  const handleApproveRefundRequest = async (caseId: string) => {
    try {
      const orderId = selectedOrder?.data?.order_id || selectedOrder?.order_id;
      setApprovingCaseId(caseId);
      await apiClient.approveAfterSalesCase(caseId);
      alert('Refund approved. Processing has started.');
      if (orderId) {
        await loadAfterSalesCases(orderId);
        await loadRefundHistory(orderId);
      }
      loadOrders();
    } catch (error: any) {
      console.error('Failed to approve refund:', error);
      const detail = error?.response?.data?.detail;
      if (typeof detail === 'string') {
        alert(detail);
      } else if (detail && typeof detail === 'object') {
        const msg = detail.message || detail.error || 'Failed to approve refund';
        const debugId = detail.debug_id ? ` (debug_id: ${detail.debug_id})` : '';
        alert(`${msg}${debugId}`);
      } else {
        alert('Failed to approve refund');
      }
    } finally {
      setApprovingCaseId(null);
    }
  };
  
  const handleRefund = async (amount: number, reason: string) => {
    try {
      const orderId = selectedOrder.data?.order_id || selectedOrder.order_id;
      await apiClient.refundOrderV2(orderId, amount, reason);
      alert('Refund processed successfully!');
      setShowRefundDialog(false);
      loadRefundHistory(orderId); // Reload refund history
      try {
        const updated = await apiClient.getOrderDetails(orderId);
        setSelectedOrder(updated);
      } catch (e) {
        // Best-effort; still refresh list.
      }
      loadOrders(); // Refresh order list
    } catch (error: any) {
      console.error('Failed to process refund:', error);
      throw error; // Let dialog handle the error
    }
  };
  
  const openOrderModal = async (order: any) => {
    setSelectedOrder(order);
    setShowOrderModal(true);
    setShowShippingForm(false);
    
    // Load refund history
    const orderId = order.data?.order_id || order.order_id;
    if (orderId) {
      await loadRefundHistory(orderId);
      await loadAfterSalesCases(orderId);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusTone = (status?: string) => {
    switch ((status || '').toLowerCase()) {
      case 'completed':
        return 'success' as const;
      case 'processing':
        return 'brand' as const;
      case 'pending':
        return 'warning' as const;
      case 'cancelled':
      case 'canceled':
        return 'critical' as const;
      default:
        return 'neutral' as const;
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = searchTerm === '' || 
      order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pendingCount = filteredOrders.filter((order) => order.status === 'pending').length;
  const processingCount = filteredOrders.filter((order) => order.status === 'processing').length;
  const completedCount = filteredOrders.filter((order) => order.status === 'completed').length;
  const visibleRevenue = filteredOrders.reduce(
    (sum, order) => sum + Number(order.amount || order.total_amount || order.total || 0),
    0
  );
  const totalPages = Math.max(1, Math.ceil(totalOrders / itemsPerPage));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  // Helper to safely get order data
  const getOrderData = () => {
    if (!selectedOrder) return null;
    return selectedOrder.data || selectedOrder;
  };
  
  const orderData = getOrderData();
  const normalizeAddress = (address: any) => {
    if (!address) return null;
    if (typeof address === 'object') return address;
    if (typeof address === 'string') {
      try {
        const parsed = JSON.parse(address);
        return typeof parsed === 'object' ? parsed : null;
      } catch (err) {
        console.warn('Failed to parse shipping address', err);
        return null;
      }
    }
    return null;
  };
  const normalizeItems = (items: any): any[] => {
    if (!items) return [];
    if (Array.isArray(items)) return items;
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('Failed to parse order items', err);
      return [];
    }
  };
  const orderItems = normalizeItems(orderData?.items);
  const shippingAddress = normalizeAddress(orderData?.shipping_address);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('dashboard.orders.eyebrow')}
        title={t('dashboard.orders.title')}
        description={t('dashboard.orders.description')}
        actions={
          <MerchantButton
            type="button"
            onClick={handleExport}
            disabled={exporting}
            icon={Download}
          >
            {exporting ? t('dashboard.orders.exporting') : t('dashboard.orders.export')}
          </MerchantButton>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="merchant-panel p-5">
          <p className="text-sm text-[color:var(--merchant-muted)]">
            {t('dashboard.orders.stats.inView')}
          </p>
          <div className="mt-1.5 text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {filteredOrders.length}
          </div>
          <p className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
            {t('dashboard.orders.stats.inViewMeta', { count: totalOrders })}
          </p>
        </div>
        <div className="merchant-panel p-5">
          <p className="text-sm text-[color:var(--merchant-muted)]">
            {t('dashboard.orders.stats.needsAction')}
          </p>
          <div className="mt-1.5 text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {pendingCount + processingCount}
          </div>
          <p className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
            {t('dashboard.orders.stats.needsActionMeta', {
              pending: pendingCount,
              processing: processingCount,
            })}
          </p>
        </div>
        <div className="merchant-panel p-5">
          <p className="text-sm text-[color:var(--merchant-muted)]">
            {t('dashboard.orders.stats.completed')}
          </p>
          <div className="mt-1.5 text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {completedCount}
          </div>
          <p className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
            {t('dashboard.orders.stats.completedMeta')}
          </p>
        </div>
        <div className="merchant-panel p-5">
          <p className="text-sm text-[color:var(--merchant-muted)]">
            {t('dashboard.orders.stats.visibleValue')}
          </p>
          <div className="mt-1.5 text-[1.9rem] font-semibold tracking-[-0.05em] text-[color:var(--merchant-ink)]">
            {formatCurrency(visibleRevenue)}
          </div>
          <p className="mt-1 text-sm text-[color:var(--merchant-muted-strong)]">
            {t('dashboard.orders.stats.visibleValueMeta')}
          </p>
        </div>
      </div>

      <SurfaceCard
        title={t('dashboard.orders.filters.title')}
        description={t('dashboard.orders.filters.description')}
        action={
          <StatusBadge tone="neutral">
            {t('dashboard.orders.filters.visibleTotal', {
              visible: filteredOrders.length,
              total: totalOrders,
            })}
          </StatusBadge>
        }
      >
        <div className="border-b border-[color:var(--merchant-line)] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[color:var(--merchant-muted)]" />
              <input
                type="text"
                placeholder={t('dashboard.orders.filters.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="merchant-input"
                style={{ paddingLeft: '3.25rem' }}
              />
            </div>
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 text-[color:var(--merchant-muted)]" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="merchant-select"
              >
                <option value="all">{t('dashboard.orders.filters.allStatus')}</option>
                <option value="pending">{t('dashboard.orders.filters.pending')}</option>
                <option value="processing">{t('dashboard.orders.filters.processing')}</option>
                <option value="completed">{t('dashboard.orders.filters.completed')}</option>
                <option value="cancelled">{t('dashboard.orders.filters.cancelled')}</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={pendingCount > 0 ? 'warning' : 'neutral'}>
                {pendingCount} pending
              </StatusBadge>
              <StatusBadge tone={processingCount > 0 ? 'brand' : 'neutral'}>
                {processingCount} processing
              </StatusBadge>
              <StatusBadge tone={completedCount > 0 ? 'success' : 'neutral'}>
                {completedCount} completed
              </StatusBadge>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard
        title={t('dashboard.orders.table.title')}
        description={t('dashboard.orders.table.description')}
        action={
          <StatusBadge tone="neutral">
            {t('dashboard.orders.table.pageOf', { page: currentPage, total: totalPages })}
          </StatusBadge>
        }
        className="overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="merchant-table min-w-full">
            <thead className="bg-[color:var(--merchant-surface-muted)]/60">
              <tr>
                <th>{t('dashboard.orders.table.orderId')}</th>
                <th>{t('dashboard.orders.table.customer')}</th>
                <th>{t('dashboard.orders.table.amount')}</th>
                <th>{t('dashboard.orders.table.status')}</th>
                <th>{t('dashboard.orders.table.date')}</th>
                <th className="text-right">{t('dashboard.orders.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <tr key={order.id || order.order_id}>
                    <td className="whitespace-nowrap text-sm font-medium text-[color:var(--merchant-ink)]">
                      <span
                        className="font-mono cursor-text"
                        title={order.order_id || order.order_number || order.id}
                      >
                        {order.order_id || order.order_number || order.id}
                      </span>
                    </td>
                    <td className="text-sm text-[color:var(--merchant-muted-strong)]">
                      {order.customer?.email || order.customer_email || t('dashboard.orders.table.guest')}
                    </td>
                    <td className="whitespace-nowrap text-sm font-medium text-[color:var(--merchant-ink)]">
                      {formatCurrency(order.amount || order.total_amount || 0)}
                    </td>
                    <td className="whitespace-nowrap">
                      <StatusBadge tone={getStatusTone(order.status)}>
                        {order.status || 'pending'}
                      </StatusBadge>
                    </td>
                    <td className="whitespace-nowrap text-sm text-[color:var(--merchant-muted)]">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap text-right text-sm">
                      <button 
                        onClick={() => handleViewOrder(order.order_id || order.id)}
                        className="font-medium text-[color:var(--merchant-brand)] hover:text-[color:var(--merchant-brand-strong)]"
                      >
                        {t('dashboard.orders.table.review')}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[color:var(--merchant-muted)]">
                    <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-[color:var(--merchant-muted)]" />
                    <p>{t('dashboard.orders.table.noOrders')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalOrders > 0 && (
          <div className="flex flex-col gap-3 border-t border-[color:var(--merchant-line)] px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-[color:var(--merchant-muted-strong)]">
              {t('dashboard.orders.table.showingRange', {
                start: ((currentPage - 1) * itemsPerPage) + 1,
                end: Math.min(currentPage * itemsPerPage, totalOrders),
                total: totalOrders,
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="merchant-button-secondary px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('dashboard.orders.table.previous')}
              </button>
              <span className="text-sm text-[color:var(--merchant-muted-strong)]">
                {t('dashboard.orders.table.pageOf', { page: currentPage, total: totalPages })}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="merchant-button-secondary px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('dashboard.orders.table.next')}
              </button>
            </div>
          </div>
        )}
      </SurfaceCard>

      {/* Order Details Modal */}
      {showOrderModal && orderData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Order Details</h2>
                <button
                  onClick={() => setShowOrderModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Order ID</p>
                    <p className="font-semibold break-all">{orderData.order_id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <p className="font-semibold capitalize break-words">{orderData.status}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Payment Status</p>
                    <p className="font-semibold capitalize break-words">{orderData.payment_status}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="font-semibold">
                      ${(orderData.total || 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Customer</h3>
                  <p className="text-sm">
                    <span className="text-gray-600">Name:</span>{' '}
                    {orderData.customer?.name || orderData.customer_name || shippingAddress?.name || 'N/A'}
                  </p>
                  <p className="text-sm">
                    <span className="text-gray-600">Email:</span>{' '}
                    {orderData.customer?.email || orderData.customer_email || 'N/A'}
                  </p>
                  {shippingAddress && (
                    <p className="text-sm mt-1 text-gray-500">
                      {shippingAddress.address_line1}
                      {shippingAddress.address_line2 ? `, ${shippingAddress.address_line2}` : ''}, {shippingAddress.city}, {shippingAddress.state} {shippingAddress.postal_code}
                    </p>
                  )}
                </div>

                {orderItems.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-2">Items</h3>
                    {orderItems.map((item: any, idx: number) => (
                      <div key={idx} className="text-sm py-2 border-b last:border-0">
                        <p className="font-medium">{item.name || item.product_name || item.product_title}</p>
                        <p className="text-gray-600">
                          Quantity: {item.quantity} × ${item.price || item.unit_price}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t pt-4">
                  <p className="text-sm">
                    <span className="text-gray-600">Created:</span>{' '}
                    {new Date(orderData.created_at).toLocaleString()}
                  </p>
                  {orderData.fulfillment_status === 'shipped' && (
                    <p className="text-sm text-green-600 mt-1">
                      Shipped via {orderData.carrier || 'Unknown'} (Track: {orderData.tracking_number || 'N/A'})
                    </p>
                  )}
                </div>
                
                {/* Shipping Form for Agent Orders */}
                {orderData.status !== 'completed' && orderData.status !== 'cancelled' && !orderData.store_id && (
                  <div className="border-t pt-4">
                    {!showShippingForm ? (
                      <button
                        onClick={() => setShowShippingForm(true)}
                        className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 font-medium text-sm"
                      >
                        <Truck className="w-4 h-4" />
                        <span>Mark as Shipped</span>
                      </button>
                    ) : (
                      <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <h4 className="font-medium text-sm">Fulfillment Details</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Tracking Number</label>
                            <input
                              type="text"
                              value={shippingData.tracking_number}
                              onChange={(e) => setShippingData({...shippingData, tracking_number: e.target.value})}
                              className="w-full border rounded px-2 py-1 text-sm"
                              placeholder="e.g. 1Z999..."
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Carrier</label>
                            <select
                              value={shippingData.carrier}
                              onChange={(e) => setShippingData({...shippingData, carrier: e.target.value})}
                              className="w-full border rounded px-2 py-1 text-sm"
                            >
                              <option value="">Select Carrier</option>
                              <option value="USPS">USPS</option>
                              <option value="UPS">UPS</option>
                              <option value="FedEx">FedEx</option>
                              <option value="DHL">DHL</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end space-x-2 pt-2">
                          <button
                            onClick={() => setShowShippingForm(false)}
                            className="px-3 py-1 text-xs border rounded hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleMarkShipped}
                            disabled={shippingLoading || !shippingData.tracking_number || !shippingData.carrier}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            {shippingLoading ? 'Saving...' : 'Confirm Shipment'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Refund Requests (After-sales cases) */}
              <div className="border-t pt-4 mt-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">Refund Requests</h3>
                  {afterSalesLoading && (
                    <span className="text-xs text-gray-500">Loading…</span>
                  )}
                </div>

                {afterSalesCases.filter((c) => c.case_type === 'refund').length === 0 ? (
                  <div className="text-sm text-gray-500">No refund requests</div>
                ) : (
                  <div className="space-y-2">
                    {afterSalesCases
                      .filter((c) => c.case_type === 'refund')
                      .map((c: any) => (
                        <div key={c.case_id} className="bg-white border rounded p-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {c.requested_refund_amount != null
                                    ? formatCurrency(Number(c.requested_refund_amount))
                                    : 'Full refund requested'}
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded ${
                                    c.status === 'requested'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : c.status === 'approved' || c.status === 'refund_pending'
                                        ? 'bg-blue-100 text-blue-800'
                                        : c.status === 'partially_refunded' || c.status === 'refunded' || c.status === 'refund_processed'
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {c.status}
                                </span>
                              </div>
                              {(c.reason_text || c.reason_code) && (
                                <div className="text-xs text-gray-600 mt-1">
                                  Reason: {c.reason_text || c.reason_code}
                                </div>
                              )}
                              {c.created_at && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Requested: {new Date(c.created_at).toLocaleString()}
                                </div>
                              )}
                            </div>

                            {c.status === 'requested' ? (
                              <button
                                onClick={() => handleApproveRefundRequest(c.case_id)}
                                disabled={approvingCaseId === c.case_id}
                                className="shrink-0 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                              >
                                {approvingCaseId === c.case_id ? 'Approving…' : 'Approve & Refund'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Refund Section */}
              {orderData.payment_status === 'paid' || orderData.payment_status === 'partially_refunded' ? (
                <div className="border-t pt-4 mt-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold">Refunds</h3>
                    {((Number(orderData.total) || 0) - (Number(orderData.total_refunded) || 0)) > 0 && (
                      <button
                        onClick={() => setShowRefundDialog(true)}
                        className="flex items-center space-x-2 text-red-600 hover:text-red-800 font-medium text-sm"
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>Process Refund</span>
                      </button>
                    )}
                  </div>
                  
                  {/* Refund Summary */}
                  <div className="bg-gray-50 p-3 rounded mb-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Refundable:</span>
                      <span className="font-medium text-green-600">
                        ${((Number(orderData.total) || 0) - (Number(orderData.total_refunded) || 0)).toFixed(2)}
                      </span>
                    </div>
                    {(Number(orderData.total_refunded) || 0) > 0 && (
                      <div className="flex justify-between mt-1">
                        <span className="text-gray-600">Already Refunded:</span>
                        <span className="font-medium text-red-600">
                          ${(Number(orderData.total_refunded) || 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Refund History */}
                  {refundHistory.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700">Refund History</h4>
                      {refundHistory.map((refund: any, idx: number) => (
                        <div key={idx} className="bg-white border rounded p-2 text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">${parseFloat(refund.amount).toFixed(2)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              refund.status === 'completed' ? 'bg-green-100 text-green-800' :
                              refund.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {refund.status}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {refund.reason && <span>Reason: {refund.reason}</span>}
                            <span className="ml-2">
                              {new Date(refund.created_at).toLocaleString()}
                            </span>
                          </div>
                          {refund.error_message && (
                            <div className="text-xs text-red-600 mt-1">
                              Error: {refund.error_message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowOrderModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Refund Dialog */}
      {showRefundDialog && selectedOrder && (
        <RefundDialog
          order={(() => {
            const base = selectedOrder.data || selectedOrder;
            const refundedFromHistory = (refundHistory || [])
              .filter((r: any) => r?.status === 'completed')
              .reduce((sum: number, r: any) => sum + (Number(r?.amount) || 0), 0);
            const existing = Number(base?.total_refunded) || 0;
            return { ...base, total_refunded: Math.max(existing, refundedFromHistory) };
          })()}
          onClose={() => setShowRefundDialog(false)}
          onRefund={handleRefund}
        />
      )}
    </div>
  );
}
