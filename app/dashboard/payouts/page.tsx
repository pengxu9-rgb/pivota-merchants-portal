'use client';

import { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Download,
  Calendar,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Check,
} from 'lucide-react';

export default function PayoutsPage() {
  const [balance, setBalance] = useState(0);
  const [pendingPayouts, setPendingPayouts] = useState<any[]>([]);
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [bankAccount, setBankAccount] = useState<any>(null);

  useEffect(() => {
    loadPayouts();
  }, []);

  const loadPayouts = async () => {
    // Mock data (replace with API call)
    setBalance(12450.75);
    setPendingPayouts([
      { id: '1', amount: 2500.00, date: '2024-10-25', status: 'pending' },
    ]);
    setPayoutHistory([
      { id: '1', amount: 5000.00, date: '2024-10-15', status: 'completed', bank: '**** 1234' },
      { id: '2', amount: 3200.50, date: '2024-10-01', status: 'completed', bank: '**** 1234' },
    ]);
    setBankAccount({
      bank_name: 'Chase Bank',
      account_last4: '1234',
      verified: true,
    });
  };

  const handleWithdraw = () => {
    const amount = prompt('Enter withdrawal amount (Available: $' + balance.toFixed(2) + '):');
    if (!amount) return;
    
    const numAmount = parseFloat(amount);
    if (numAmount > balance) {
      alert('❌ Insufficient balance');
      return;
    }
    
    alert('✅ Withdrawal request submitted!\n\nAmount: $' + numAmount.toFixed(2) + '\n\nExpected in 2-3 business days.');
  };

  const handleAddBankAccount = () => {
    alert('Bank account linking coming soon. Contact support@pivota.cc for assistance.');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
        <p className="text-gray-600">Manage your earnings and withdrawals</p>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 mb-2">Available Balance</p>
            <h2 className="text-4xl font-bold">{formatCurrency(balance)}</h2>
            <div className="flex items-center mt-4 space-x-4">
              <div className="flex items-center text-blue-100">
                <TrendingUp className="w-4 h-4 mr-1" />
                <span className="text-sm">+15.3% this month</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleWithdraw}
            className="px-6 py-3 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors"
          >
            Withdraw Funds
          </button>
        </div>
      </div>

      {/* Bank Account */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Bank Account</h2>
          {!bankAccount && (
            <button
              onClick={handleAddBankAccount}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add Account
            </button>
          )}
        </div>
        {bankAccount ? (
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center space-x-3">
              <CreditCard className="w-6 h-6 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900">{bankAccount.bank_name}</p>
                <p className="text-sm text-gray-600">•••• {bankAccount.account_last4}</p>
              </div>
            </div>
            {bankAccount.verified && (
              <span className="flex items-center text-sm text-green-600">
                <Check className="w-4 h-4 mr-1" />
                Verified
              </span>
            )}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-600 mb-2">No bank account linked</p>
            <button
              onClick={handleAddBankAccount}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Add bank account to receive payouts
            </button>
          </div>
        )}
      </div>

      {/* Pending Payouts */}
      {pendingPayouts.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Pending Payouts</h2>
          </div>
          <div className="p-6 space-y-3">
            {pendingPayouts.map((payout) => (
              <div key={payout.id} className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Calendar className="w-5 h-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-gray-900">{formatCurrency(payout.amount)}</p>
                    <p className="text-sm text-gray-600">Expected: {new Date(payout.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                  Processing
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payout History */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Payout History</h2>
          <button className="flex items-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank Account</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {payoutHistory.length > 0 ? (
                payoutHistory.map((payout) => (
                  <tr key={payout.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Date(payout.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {formatCurrency(payout.amount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {payout.bank}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {payout.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    No payout history
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">Payout Schedule</p>
            <p>Payouts are processed every Friday. Funds typically arrive in 2-3 business days.</p>
          </div>
        </div>
      </div>
    </div>
  );
}


