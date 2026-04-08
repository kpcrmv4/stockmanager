'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Card,
  CardContent,
  Input,
  Modal,
  ModalFooter,
  Badge,
  toast,
} from '@/components/ui';
import {
  Plus,
  Edit,
  Search,
  Loader2,
  Phone,
  Building2,
  CreditCard,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from 'next-intl';
import type { AEProfile } from '@/types/commission';

export function AEManagement() {
  const t = useTranslations('commission');
  const [aeList, setAeList] = useState<AEProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editModal, setEditModal] = useState<AEProfile | null | 'new'>(null);

  const fetchAE = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (showInactive) params.set('active', 'false');
      const res = await fetch(`/api/ae?${params}`);
      if (res.ok) setAeList(await res.json());
    } finally {
      setLoading(false);
    }
  }, [search, showInactive]);

  useEffect(() => { fetchAE(); }, [fetchAE]);

  return (
    <div className="space-y-4">
      {/* Search + Actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('ae.searchPlaceholder')}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          {t('ae.showInactive')}
        </label>
        <Button size="sm" onClick={() => setEditModal('new')}>
          <Plus className="h-4 w-4" />
          {t('ae.addAE')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : aeList.length === 0 ? (
        <p className="py-8 text-center text-gray-500 dark:text-gray-400">
          {t('ae.noData')}
        </p>
      ) : (
        <div className="space-y-2">
          {aeList.map((ae) => (
            <Card key={ae.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {ae.name}
                      </p>
                      {ae.nickname && (
                        <span className="text-sm text-gray-400">({ae.nickname})</span>
                      )}
                      {!ae.is_active && <Badge variant="default" size="sm">{t('ae.inactive')}</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {ae.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {ae.phone}
                        </span>
                      )}
                      {ae.bank_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {ae.bank_name}
                        </span>
                      )}
                      {ae.bank_account_no && (
                        <span className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3" /> {ae.bank_account_no}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditModal(ae)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      {editModal && (
        <AEFormModal
          ae={editModal === 'new' ? null : editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => {
            setEditModal(null);
            fetchAE();
          }}
        />
      )}
    </div>
  );
}

// ─── AE Form Modal ───
interface AEFormModalProps {
  ae: AEProfile | null;
  onClose: () => void;
  onSaved: () => void;
}

function AEFormModal({ ae, onClose, onSaved }: AEFormModalProps) {
  const t = useTranslations('commission');
  const { user } = useAuthStore();
  const isNew = !ae;
  const [name, setName] = useState(ae?.name || '');
  const [nickname, setNickname] = useState(ae?.nickname || '');
  const [phone, setPhone] = useState(ae?.phone || '');
  const [bankName, setBankName] = useState(ae?.bank_name || '');
  const [bankAccountNo, setBankAccountNo] = useState(ae?.bank_account_no || '');
  const [bankAccountName, setBankAccountName] = useState(ae?.bank_account_name || '');
  const [notes, setNotes] = useState(ae?.notes || '');
  const [isActive, setIsActive] = useState(ae?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      toast({ type: 'error', title: t('ae.nameRequired') });
      return;
    }

    setSaving(true);
    try {
      const payload = { name, nickname, phone, bank_name: bankName, bank_account_no: bankAccountNo, bank_account_name: bankAccountName, notes, is_active: isActive };
      const url = isNew ? '/api/ae' : `/api/ae/${ae!.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        toast({ type: 'success', title: isNew ? t('ae.addSuccess') : t('ae.editSuccess') });
        logAudit({ action_type: isNew ? AUDIT_ACTIONS.AE_PROFILE_CREATED : AUDIT_ACTIONS.AE_PROFILE_UPDATED, table_name: 'ae_profiles', record_id: saved.id, new_value: payload as Record<string, unknown>, changed_by: user?.id });
        onSaved();
      } else {
        const err = await res.json();
        toast({ type: 'error', title: err.error || t('ae.error') });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isNew ? t('ae.addNewAE') : `${t('ae.editPrefix')}: ${ae!.name}`}
      size="lg"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('ae.aeName')} value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label={t('ae.nickname')} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <Input label={t('ae.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />

        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('ae.bankInfo')}</p>
        <Input label={t('ae.bankName')} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder={t('ae.bankNamePlaceholder')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('ae.bankAccountNo')} value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} />
          <Input label={t('ae.bankAccountName')} value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} />
        </div>
        <Input label={t('ae.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />

        {!isNew && (
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            {t('ae.active')}
          </label>
        )}
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>{t('ae.cancel')}</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isNew ? t('ae.addAE') : t('ae.saveBtn')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
