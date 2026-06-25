export const KAKAO_FRIEND_ID = '__KAKAO_FRIEND__';
export const ONLINE_ID = '__ONLINE__';
export const LOCAL_GUIDE_ID = '__LOCAL_GUIDE__';

export function normalizeGuideName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s.]/g, '');
}

export function isSpecialLocalGuideName(name) {
  const value = String(name || '').trim();
  return value === ONLINE_ID || value === KAKAO_FRIEND_ID;
}

export function formatLocalGuideLabel(name) {
  const value = String(name || '').trim();
  if (value === ONLINE_ID) return 'Online';
  if (value === KAKAO_FRIEND_ID) return 'Kakao (10%)';
  return value;
}

export function getGuideSelectOptions(guides = []) {
  const guideList = Array.isArray(guides) ? guides.slice() : [];
  const mrMoonGuide = guideList.find((g) => normalizeGuideName(g?.name) === 'mrmoon') || null;
  const peterGuide = guideList.find((g) => normalizeGuideName(g?.name).includes('peter')) || null;
  const ellaGuide = guideList.find((g) => normalizeGuideName(g?.name).includes('ella')) || null;
  const otherGuides = guideList
    .filter((g) => {
      const name = normalizeGuideName(g?.name);
      return name && name !== 'mrmoon' && !name.includes('peter') && !name.includes('ella');
    })
    .sort((a, b) => String(a?.name || '').trim().localeCompare(String(b?.name || '').trim()));

  return [
    { value: '', label: 'No Guide' },
    mrMoonGuide
      ? {
          value: String(mrMoonGuide.id),
          label: 'Mr.Moon (10%)',
          style: { backgroundColor: 'rgba(212,175,55,0.5)', color: '#000' },
        }
      : null,
    {
      value: KAKAO_FRIEND_ID,
      label: 'Kakao (10%)',
      style: { backgroundColor: 'rgba(249,115,22,0.2)', color: 'var(--text-main)' },
    },
    {
      value: LOCAL_GUIDE_ID,
      label: 'Local Guide',
      style: { backgroundColor: 'rgba(34,197,94,0.2)', color: 'var(--text-main)' },
    },
    peterGuide
      ? {
          value: String(peterGuide.id),
          label: 'Peter (20%)',
          style: { backgroundColor: 'rgba(56,189,248,0.2)', color: 'var(--text-main)' },
        }
      : null,
    ellaGuide
      ? {
          value: String(ellaGuide.id),
          label: 'Ella',
          style: { backgroundColor: 'rgba(255, 105, 180, 0.1)', color: 'var(--text-main)' },
        }
      : null,
    ...otherGuides.map((guide) => ({
      value: String(guide.id),
      label: String(guide.name || ''),
    })),
    {
      value: ONLINE_ID,
      label: 'Online',
      style: { backgroundColor: 'rgba(168,85,247,0.3)', color: 'var(--text-main)' },
    },
  ].filter(Boolean);
}

export function resolveGuideSelectValue({ guideId, localGuideName, fallbackValue = '' } = {}) {
  const guideValue = String(guideId || '').trim();
  if (guideValue) return guideValue;

  const localValue = String(localGuideName || '').trim();
  if (localValue === ONLINE_ID) return ONLINE_ID;
  if (localValue === KAKAO_FRIEND_ID) return KAKAO_FRIEND_ID;
  if (localValue) return LOCAL_GUIDE_ID;

  return String(fallbackValue || '');
}

export function buildGuideAssignmentPayload({ selectedGuide, localGuideName } = {}) {
  const value = String(selectedGuide || '').trim();
  const localValue = String(localGuideName || '').trim();

  if (!value) {
    return { guideId: null, localGuideName: '', isKakaoFriend: false };
  }
  if (value === KAKAO_FRIEND_ID) {
    return { guideId: null, localGuideName: KAKAO_FRIEND_ID, isKakaoFriend: true };
  }
  if (value === ONLINE_ID) {
    return { guideId: null, localGuideName: ONLINE_ID, isKakaoFriend: false };
  }
  if (value === LOCAL_GUIDE_ID) {
    return { guideId: null, localGuideName: localValue, isKakaoFriend: false };
  }
  return { guideId: value, localGuideName: '', isKakaoFriend: false };
}
