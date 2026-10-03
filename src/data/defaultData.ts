import type { Criterion, Player, TryoutSession } from '../types';

export const DEFAULT_CRITERIA_TEMPLATES: Omit<Criterion, 'id' | 'session_id'>[] = [
  // 6 Offensive Skills
  {
    name: 'Break Throws',
    category: 'Offense',
    description: 'Inside-out, around backhand/forehand break throws under heavy mark pressure.',
    exemplar_player_name: '',
    sort_order: 1
  },
  {
    name: 'Deep Throwing / Hucks',
    category: 'Offense',
    description: 'Range, shape, touch, and reading wind on deep forehands & backhands.',
    exemplar_player_name: '',
    sort_order: 2
  },
  {
    name: 'Cutting & Separation',
    category: 'Offense',
    description: 'Change of pace, sharp footwork, cutting timing, and creating clear throwing lanes.',
    exemplar_player_name: '',
    sort_order: 3
  },
  {
    name: 'Catching & Disc Security',
    category: 'Offense',
    description: 'Two-handed rim catches, layout catches, high pointing contested discs, clamp.',
    exemplar_player_name: '',
    sort_order: 4
  },
  {
    name: 'Reset / Dump Movement',
    category: 'Offense',
    description: 'Active handler movement, 45-degree fills, getting open at stall 4-5 consistently.',
    exemplar_player_name: '',
    sort_order: 5
  },
  {
    name: 'Field Vision & Decision Making',
    category: 'Offense',
    description: 'Progressing through options, choosing high-percentage throws, flow tempo.',
    exemplar_player_name: '',
    sort_order: 6
  },

  // 6 Defensive Skills
  {
    name: 'Marking & Footwork',
    category: 'Defense',
    description: 'Active hands, staying on balance, forcing intended side without biting on fakes.',
    exemplar_player_name: '',
    sort_order: 7
  },
  {
    name: 'Under / Reset Defense',
    category: 'Defense',
    description: 'Denying easy unders, body positioning on handler resets, hip turns.',
    exemplar_player_name: '',
    sort_order: 8
  },
  {
    name: 'Deep Defense / Positioning',
    category: 'Defense',
    description: 'Tracking discs in flight, boxing out, attacking the peak without fouling.',
    exemplar_player_name: '',
    sort_order: 9
  },
  {
    name: 'Bid / Layout Willingness',
    category: 'Defense',
    description: 'Effort to generate blocks, closing speed on loose discs, layout awareness.',
    exemplar_player_name: '',
    sort_order: 10
  },
  {
    name: 'Switching & Communication',
    category: 'Defense',
    description: 'Calling up on throws, bracket awareness, smooth poach/switch recovery.',
    exemplar_player_name: '',
    sort_order: 11
  },
  {
    name: 'Handler Pressure / Poach',
    category: 'Defense',
    description: 'Tight person defense on handlers, disrupting give-and-go flows.',
    exemplar_player_name: '',
    sort_order: 12
  },

  // 4 Athleticism & Intangibles
  {
    name: 'Speed & Quickness',
    category: 'Athleticism & Intangibles',
    description: 'First-step acceleration, top-end sprint speed in transition.',
    exemplar_player_name: '',
    sort_order: 13
  },
  {
    name: 'Conditioning & High Motor',
    category: 'Athleticism & Intangibles',
    description: 'Sustained intensity point after point, running hard in late scrimmage drills.',
    exemplar_player_name: '',
    sort_order: 14
  },
  {
    name: 'Spirit & Coachability',
    category: 'Athleticism & Intangibles',
    description: 'Receptive to coach feedback, positive sideline energy, fair minded dispute resolution.',
    exemplar_player_name: '',
    sort_order: 15
  },
  {
    name: 'Clutch / Composure',
    category: 'Athleticism & Intangibles',
    description: 'Poise in tight points, calm under hard sideline talk/marks.',
    exemplar_player_name: '',
    sort_order: 16
  }
];

export const PRESET_NOTE_TAGS = [
  '🔒 Lock for team',
  '⭐️ Standout performer',
  '📈 High upside / Coachable',
  '⚖️ Bubble contender',
  '🏃 Extreme athleticism / motor',
  '🎯 Elite handler vision',
  '🛡️ Lockdown defender',
  '⚠️ Struggles with turnovers',
  '📉 Cut / Move down to Dev team',
  '❌ Do not consider'
];

export const PINNEY_COLORS = [
  { name: 'Red', hex: '#ef4444', text: 'text-white', border: 'border-red-500', bg: 'bg-red-600' },
  { name: 'Navy / Blue', hex: '#1d4ed8', text: 'text-white', border: 'border-blue-600', bg: 'bg-blue-700' },
  { name: 'White', hex: '#f8fafc', text: 'text-slate-900', border: 'border-slate-300', bg: 'bg-white' },
  { name: 'Black', hex: '#0f172a', text: 'text-white', border: 'border-slate-600', bg: 'bg-slate-900' },
  { name: 'Green', hex: '#16a34a', text: 'text-white', border: 'border-green-600', bg: 'bg-green-600' },
  { name: 'Yellow / Gold', hex: '#eab308', text: 'text-slate-950', border: 'border-yellow-500', bg: 'bg-yellow-400' },
  { name: 'Orange', hex: '#f97316', text: 'text-white', border: 'border-orange-500', bg: 'bg-orange-500' },
  { name: 'Purple', hex: '#9333ea', text: 'text-white', border: 'border-purple-600', bg: 'bg-purple-600' },
  { name: 'Pink', hex: '#ec4899', text: 'text-white', border: 'border-pink-500', bg: 'bg-pink-500' },
  { name: 'Teal', hex: '#0d9488', text: 'text-white', border: 'border-teal-500', bg: 'bg-teal-600' },
];

export const INITIAL_SAMPLE_PLAYERS: Omit<Player, 'id' | 'session_id'>[] = [
  { name: 'Kian M.', pinney_number: 7, pinney_color: 'Navy / Blue', group_name: 'Group A', is_locked: true, status: 'active' },
  { name: 'Lucas W.', pinney_number: 14, pinney_color: 'Red', group_name: 'Group A', is_locked: false, status: 'active' },
  { name: 'Maya S.', pinney_number: 22, pinney_color: 'White', group_name: 'Group A', is_locked: false, status: 'active' },
  { name: 'Ethan B.', pinney_number: 3, pinney_color: 'Navy / Blue', group_name: 'Group A', is_locked: false, status: 'active' },
  { name: 'Ava T.', pinney_number: 11, pinney_color: 'Red', group_name: 'Group B', is_locked: false, status: 'active' },
  { name: 'Noah G.', pinney_number: 88, pinney_color: 'Yellow / Gold', group_name: 'Group B', is_locked: false, status: 'active' },
  { name: 'Sammy C.', pinney_number: 19, pinney_color: 'Green', group_name: 'Group B', is_locked: false, status: 'active' },
  { name: 'Chloe Z.', pinney_number: 44, pinney_color: 'White', group_name: 'Group B', is_locked: false, status: 'active' },
  { name: 'Tyler R.', pinney_number: 99, pinney_color: 'Black', group_name: 'Group A', is_locked: false, status: 'no_need_to_watch' },
];

export const INITIAL_DEFAULT_SESSION: TryoutSession = {
  id: 'session-1',
  name: 'Session 1 - Open Tryout',
  session_number: 1,
  target_roster_size: 22,
  date: new Date().toISOString().split('T')[0],
  status: 'active',
  admin_pin_hash: '2026' // default coach PIN
};
