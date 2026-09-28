import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '@/hooks/use-auth';
import { useViewPreference } from '@/hooks/use-view-preference';
import ViewSwitcherModal from './viewswitchermodal';

// const extra = (Constants.expoConfig?.extra ?? {}) as { API_BASE_URL?: string };
// const API_BASE_URL = extra.API_BASE_URL;

const ACCENT = '#2D5BFF';

type DateFilter = 'today' | 'wtd' | 'mtd';


type IdrPeriod = { active: number; paid: number; defaulted: number; par_percentage: number };
type IdrPayload = {
  both_par: [
    IdrPeriod,
    IdrPeriod & { overall: IdrPeriod; one_month: IdrPeriod; three_month: IdrPeriod },
  ];
  par_percent: number;
};

type CashBalanceGroupItem = { amount: number; expenses?: number; collections?: number; disbursements?: number };
type GroupedPayload = Record<string, { amount: number }[]>;

export default function HomeScreen() {
  const { authFetch } = useAuth();
  const { queryParams, currentViewLabel, options, viewType, setView } = useViewPreference();
  // const { accessToken } = useAuth();

  const [currentDate, setCurrentDate] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('mtd');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showViewSwitcher, setShowViewSwitcher] = useState(false);

  const [loading, setLoading] = useState(true);
  const [idr, setIdr] = useState<IdrPayload | null>(null);
  const [cashBalance, setCashBalance] = useState<Record<string, CashBalanceGroupItem[]>>({});
  const [collections, setCollections] = useState<GroupedPayload>({});
  const [disbursements, setDisbursements] = useState<GroupedPayload>({});

  useEffect(() => {
    const today = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    setCurrentDate(
      `${days[today.getDay()].slice(0, 3)}, ${today.getDate()}, ${months[today.getMonth()]} ${today.getFullYear()}`
    );
  }, []);

  const fetchJson = useCallback(
    async (path: string) => {
      const res = await authFetch(path);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed: ${path}`);
      }
      return data.payload;
    },
    [authFetch]
  );

  const fetchIdr = useCallback(async () => {
    try {
      const payload = await fetchJson(`/api/mobile/staff/dashboard/idr?dummy=1${queryParams}`);
      setIdr(payload);
    } catch (e) {
      console.warn('[HomeScreen] IDR fetch failed:', e);
    }
  }, [fetchJson, queryParams]);

  const fetchCashBalance = useCallback(async () => {
    try {
      const payload = await fetchJson(`/api/mobile/staff/dashboard/cash_balance?period=mtd${queryParams}`);
      setCashBalance(payload || {});
    } catch (e) {
      console.warn('[HomeScreen] Cash balance fetch failed:', e);
    }
  }, [fetchJson, queryParams]);

  const fetchCollectionsAndDisbursements = useCallback(
    async (period: DateFilter) => {
      try {
        const [collPayload, disbPayload] = await Promise.all([
          fetchJson(`/api/mobile/staff/dashboard/collections?period=${period}${queryParams}`),
          fetchJson(`/api/mobile/staff/dashboard/disbursements?period=${period}${queryParams}`),
        ]);
        setCollections(collPayload || {});
        setDisbursements(disbPayload || {});
      } catch (e) {
        console.warn('[HomeScreen] Collections/Disbursements fetch failed:', e);
      }
    },
    [fetchJson, queryParams]
  );

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchIdr(), fetchCashBalance(), fetchCollectionsAndDisbursements(dateFilter)]);
  }, [fetchIdr, fetchCashBalance, fetchCollectionsAndDisbursements, dateFilter]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [queryParams]);

  useEffect(() => {
    fetchCollectionsAndDisbursements(dateFilter);
  }, [dateFilter, fetchCollectionsAndDisbursements]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const handleProfilePress = () => {
    console.log('[HomeScreen] profile pressed — dummy no-op');
  };

  const handleActionsPress = () => {
    router.push('/actions');
  };

  const handleViewButtonPress = () => {
    setShowViewSwitcher(true);
  };

  const calculateTotal = (groupedData: GroupedPayload) => {
    let total = 0;
    Object.values(groupedData).forEach((items) => {
      items.forEach((item) => {
        total += item.amount || 0;
      });
    });
    return Math.round(total);
  };

  const getProgressColor = (pct: number) => (pct >= 30 ? '#FF4444' : pct >= 20 ? '#FF9800' : '#00C853');

  const renderIDRCard = () => {
    const individual = idr?.both_par?.[1];
    const rows: [string, number][] = individual
      ? [
          ['1 Month', individual.one_month.par_percentage],
          ['3 Months', individual.three_month.par_percentage],
          ['Overall', individual.overall.par_percentage],
        ]
      : [];

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="trending-down" size={18} color={ACCENT} />
          <Text style={styles.cardTitle}>Installments Default Rate (IDR)</Text>
        </View>
        {rows.length === 0 && <Text style={styles.emptyText}>No IDR data available</Text>}
        {rows.map(([label, pct]) => {
          const color = getProgressColor(pct);
          return (
            <React.Fragment key={label}>
              <View style={styles.rateItem}>
                <Text style={styles.rateLabel}>{label}</Text>
                <Text style={[styles.rateValue, { color }]}>{pct.toFixed(2)}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
              </View>
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  const renderBusinessUnitCard = () => {
    const groups = Object.values(cashBalance).flat();
    const totalExpenses = groups.reduce((a, i) => a + (i.expenses || 0), 0);
    const totalCashBalance = groups.reduce((a, i) => a + (i.amount || 0), 0);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="briefcase-outline" size={18} color={ACCENT} />
          <Text style={styles.cardTitle}>Business Unit (BU)</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryBox, { backgroundColor: '#FFE0B2', borderColor: '#FF6F00' }]}>
            <Text style={[styles.summaryValue, { color: '#E65100' }]}>{totalExpenses.toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>Expenses</Text>
          </View>
          <View style={[styles.summaryBox, { backgroundColor: '#E8F5E9', borderColor: '#00C853' }]}>
            <Text style={[styles.summaryValue, { color: '#00C853' }]}>{totalCashBalance.toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>Cash Balance</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCollectionsDisbursementsCards = () => {
    const collectionsTotal = calculateTotal(collections);
    const disbursementsTotal = calculateTotal(disbursements);
    const filterLabel = dateFilter === 'today' ? 'Today' : dateFilter === 'wtd' ? 'WTD' : 'MTD';

    return (
      <View style={styles.updatesSection}>
        <View style={styles.updateCardsContainer}>
          <View style={[styles.updateCard, { backgroundColor: '#4CAF50' }]}>
            <Text style={styles.updateCardTitle}>Collections</Text>
            <Text style={styles.updateCardValue}>{collectionsTotal.toLocaleString()}</Text>
            <TouchableOpacity
              style={[styles.updateCardFooter, { backgroundColor: '#66BB6A' }]}
              onPress={() => setShowFilterMenu(!showFilterMenu)}
            >
              <Ionicons name="calendar" size={14} color="white" />
              <Text style={styles.updateCardFooterText}>{filterLabel}</Text>
              <Ionicons name="chevron-down" size={14} color="white" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <View style={[styles.updateCard, { backgroundColor: '#2196F3' }]}>
            <View style={[styles.updateCardIconContainer, { backgroundColor: '#42A5F5' }]}>
              <Ionicons name="trending-down" size={22} color="white" />
            </View>
            <Text style={styles.updateCardTitle}>Disbursements</Text>
            <Text style={styles.updateCardValue}>{disbursementsTotal.toLocaleString()}</Text>
            <TouchableOpacity
              style={[styles.updateCardFooter, { backgroundColor: '#42A5F5' }]}
              onPress={() => setShowFilterMenu(!showFilterMenu)}
            >
              <Ionicons name="calendar" size={14} color="white" />
              <Text style={styles.updateCardFooterText}>{filterLabel}</Text>
              <Ionicons name="chevron-down" size={14} color="white" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        </View>

        {showFilterMenu && (
          <View style={styles.filterMenu}>
            {(
              [
                ['today', 'Today'],
                ['wtd', 'Week to Date'],
                ['mtd', 'Month to Date'],
              ] as const
            ).map(([val, label]) => (
              <TouchableOpacity
                key={val}
                style={[styles.filterOption, dateFilter === val && styles.filterOptionActive]}
                onPress={() => {
                  setDateFilter(val);
                  setShowFilterMenu(false);
                }}
              >
                <Text style={[styles.filterOptionText, dateFilter === val && styles.filterOptionTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={ACCENT} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} />}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.dateLabel}>Date</Text>
              <Text style={styles.dateValue}>{currentDate}</Text>
            </View>
            <TouchableOpacity style={styles.profileButton} onPress={handleProfilePress}>
              <View style={styles.profileIcon}>
                <Ionicons name="person" size={20} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.headerBottom}>
            <View style={styles.currentViewContainer}>
              <Text style={styles.switchViewLabel}>Current View</Text>
              <TouchableOpacity style={styles.currentViewBox} onPress={handleViewButtonPress} activeOpacity={0.7}>
                <Ionicons name="business" size={14} color={ACCENT} style={styles.currentViewIcon} />
                <View style={styles.currentViewTextContainer}>
                  <Text style={styles.currentViewLabel}>Your View:</Text>
                  <Text style={styles.currentViewValue} numberOfLines={1}>
                    {currentViewLabel}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={13} color={ACCENT} style={{ opacity: 0.6 }} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.actionsButton} onPress={handleActionsPress}>
              <Text style={styles.actionsButtonText}>Actions</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {renderIDRCard()}
        {renderBusinessUnitCard()}
        {renderCollectionsDisbursementsCards()}

        <TouchableOpacity style={styles.bottomActionsButton} onPress={handleActionsPress}>
          <Text style={styles.actionsButtonText}>Actions</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>

      <ViewSwitcherModal visible={showViewSwitcher} onClose={() => setShowViewSwitcher(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  scrollView: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, backgroundColor: '#fff', marginTop: 12 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  headerLeft: { flex: 1 },
  dateLabel: { fontSize: 11, color: '#757575', marginBottom: 2 },
  dateValue: { fontSize: 12, color: '#212121', fontWeight: '500' },
  profileButton: { padding: 2 },
  profileIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: ACCENT, justifyContent: 'center', alignItems: 'center' },
  headerBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  currentViewContainer: { flex: 1, marginRight: 12 },
  switchViewLabel: { fontSize: 11, color: '#757575', marginBottom: 4, fontWeight: '500' },
  currentViewBox: {
    backgroundColor: '#E3F2FD',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  currentViewIcon: { marginRight: 6 },
  currentViewTextContainer: { flex: 1 },
  currentViewLabel: { fontSize: 9, color: '#757575', marginBottom: 1 },
  currentViewValue: { fontSize: 11, color: ACCENT, fontWeight: '600' },
  actionsButton: {
    backgroundColor: ACCENT,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  actionsButtonText: { color: '#fff', fontSize: 14, fontWeight: '600', marginRight: 4 },
  bottomActionsButton: {
    backgroundColor: ACCENT,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 8,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#212121', marginLeft: 8 },
  emptyText: { fontSize: 13, color: '#9e9e9e', fontStyle: 'italic' },
  rateItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  rateLabel: { fontSize: 13, color: '#616161' },
  rateValue: { fontSize: 14, fontWeight: '600' },
  progressBar: { height: 6, backgroundColor: '#EEEEEE', borderRadius: 3, marginBottom: 14, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryBox: { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12, marginHorizontal: 4, borderRadius: 8, borderWidth: 1.5 },
  summaryValue: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  summaryLabel: { fontSize: 11, color: '#757575', textAlign: 'center', fontWeight: '500' },
  updatesSection: { paddingHorizontal: 16, marginBottom: 12, marginTop: 12 },
  updateCardsContainer: { flexDirection: 'row', gap: 12 },
  updateCard: { flex: 1, borderRadius: 16, padding: 16, minHeight: 140, justifyContent: 'space-between' },
  updateCardIconContainer: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  updateCardTitle: { fontSize: 13, color: 'white', fontWeight: '500', marginBottom: 8 },
  updateCardValue: { fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: 12 },
  updateCardFooter: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, alignSelf: 'flex-start' },
  updateCardFooterText: { fontSize: 12, color: 'white', marginLeft: 6, fontWeight: '600' },
  filterMenu: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginTop: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  filterOption: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 },
  filterOptionActive: { backgroundColor: '#E3F2FD' },
  filterOptionText: { fontSize: 14, color: '#666666', fontWeight: '500' },
  filterOptionTextActive: { color: ACCENT, fontWeight: '600' },
  bottomPadding: { height: 20 },
});