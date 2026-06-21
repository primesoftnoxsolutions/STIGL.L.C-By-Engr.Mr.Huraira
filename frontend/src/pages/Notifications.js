import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  BellAlertIcon,
  ArrowDownIcon,
  ArrowUpIcon
} from '@heroicons/react/24/outline';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/notifications');
      setNotifications(res.data.data || []);
    } catch (error) {
      console.error('Failed to load notifications', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let intervalId = null;

    const clearPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const pollIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchNotifications();
    };

    const startPolling = () => {
      clearPolling();
      intervalId = setInterval(pollIfVisible, 15000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollIfVisible();
        startPolling();
        return;
      }
      clearPolling();
    };

    pollIfVisible();
    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchNotifications]);

  const markAllRead = async () => {
    try {
      await api.post('/notifications/mark-read');
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Failed to mark notifications read', error);
      toast.error('Failed to mark notifications as read');
    }
  };

  const deleteAllNotifications = async () => {
    const confirmed = window.confirm('Delete all notifications? This cannot be undone.');
    if (!confirmed) return;
    try {
      await api.delete('/notifications/clear');
      setNotifications([]);
      toast.success('All notifications deleted');
    } catch (error) {
      console.error('Failed to delete notifications', error);
      toast.error('Failed to delete notifications');
    }
  };

  const unreadCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);

  const isDepositAlert = (notification) => notification?.meta?.kind === 'deposit_overdue';

  const iconForType = (notification) => {
    if (isDepositAlert(notification)) return BellAlertIcon;
    if (notification.type === 'stock_assigned') return ArrowDownIcon;
    return ArrowUpIcon;
  };

  const labelForType = (notification) => {
    if (isDepositAlert(notification)) return 'Pending Cylinder Reminder';
    if (notification.type === 'stock_assigned') return 'Stock Assigned';
    return 'Stock Returned';
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      <div className="glass-card p-3 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-600 mt-1">Track stock assignments and returns.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-card px-3 py-2 text-xs text-gray-600 flex items-center gap-2">
            <BellAlertIcon className="h-4 w-4 text-blue-500" />
            {unreadCount} unread
          </div>
          <button
            onClick={markAllRead}
            className="glass-button-primary px-2 py-1 text-[11px] font-semibold text-white"
          >
            Mark All as Read
          </button>
          <button
            onClick={deleteAllNotifications}
            className="glass-button px-2 py-1 text-[11px] font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100"
          >
            Delete All
          </button>
        </div>
      </div>

      <div className="glass-card p-3 sm:p-6">
        {loading && (
          <div className="text-center text-sm text-gray-500 py-6">Loading notifications...</div>
        )}
        {!loading && notifications.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-6">No notifications yet.</div>
        )}
        {!loading && notifications.length > 0 && (
          <div className="max-h-[70vh] overflow-y-auto space-y-3 pr-2">
            {notifications.map((notification) => {
              const Icon = iconForType(notification);
              const dimmed = notification.readAt ? 'opacity-60' : '';
              return (
                <div
                  key={notification.id}
                  className={`glass-card p-4 flex items-start gap-3 hover:shadow-lg transition ${dimmed}`}
                >
                  <div className="h-10 w-10 rounded-full bg-white/80 border border-white/60 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800">{labelForType(notification)}</p>
                      <span className="text-xs text-gray-500">
                        {new Date(notification.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {notification.message || 'Stock notification'}
                    </p>
                    {isDepositAlert(notification) && (
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                        <div>
                          Customer: <span className="font-semibold text-gray-700">{notification.meta?.customerName || 'N/A'}</span>
                        </div>
                        <div>
                          Pending Cylinders: <span className="font-semibold text-gray-700">{notification.meta?.pendingQuantity ?? 0}</span>
                        </div>
                        <div>
                          Last Deposit: <span className="font-semibold text-gray-700">{notification.meta?.lastDepositDate ? new Date(notification.meta.lastDepositDate).toLocaleDateString('en-GB') : 'N/A'}</span>
                        </div>
                        <div>
                          Status:{' '}
                          <span className={`font-semibold ${notification.meta?.status === 'resolved' ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {notification.meta?.status === 'resolved' ? 'Resolved' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    )}
                    {notification.meta?.employeeName && (
                      <p className="text-xs text-gray-600 mt-1">
                        Employee: <span className="font-semibold text-gray-700">{notification.meta.employeeName}</span>
                      </p>
                    )}
                    {notification.meta?.itemsSummary && (
                      <p className="text-xs text-gray-600 mt-1">
                        Items: <span className="font-semibold text-gray-700">{notification.meta.itemsSummary}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
