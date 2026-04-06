import { useTranslation } from 'react-i18next';
import { Modal } from '../../themes/uiComponents';
import { EventMembersPanel } from './EventMembersPanel';

export function EventMembersModal({
  open,
  onClose,
  eventId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string | null;
  title?: string;
}) {
  const { t } = useTranslation(['common']);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t('common:event_members_modal_title')}
      width={620}
    >
      <EventMembersPanel eventId={eventId} />
    </Modal>
  );
}
