'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ordersApi } from '../../../lib/api';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = (params?.orderId as string) || '';
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('merchant_token');
    if (!token) {
      router.push('/login');
      return;
    }
    load();
  }, [orderId, router]);

  const load = async () => {
    try {
      setLoading(true);
      const data = await ordersApi.getOrderDetails(orderId);
      setOrder(data.order || data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <button onClick={() => router.back()} className="mb-4 text-sm text-blue-600 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => router.back()} className="mb-4 text-sm text-blue-600 flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-semibold mb-4">Order {order?.order_id || orderId}</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Status</p>
            <p className="font-medium">{order?.status || 'pending'}</p>
          </div>
          <div>
            <p className="text-gray-600">Amount</p>
            <p className="font-medium">${order?.amount || 0}</p>
          </div>
          <div>
            <p className="text-gray-600">Customer</p>
            <p className="font-medium">{order?.customer?.email || order?.customer || 'AI Agent'}</p>
          </div>
          <div>
            <p className="text-gray-600">Created</p>
            <p className="font-medium">{new Date(order?.created_at || Date.now()).toLocaleString()}</p>
          </div>
        </div>

        {Array.isArray(order?.items) && order.items.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold mb-2">Items</h2>
            <div className="border rounded">
              {order.items.map((it: any, idx: number) => (
                <div key={idx} className="px-4 py-2 border-b last:border-b-0 flex items-center justify-between text-sm">
                  <span>{it.name || it.product_id}</span>
                  <span>x{it.quantity} • ${it.price}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


