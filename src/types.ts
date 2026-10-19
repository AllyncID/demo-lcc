export interface Field { id: string; label: string; type: 'text' | 'textarea' | 'email' | 'url' | 'number' | 'select' | 'checkbox'; required: boolean; options: string[] }
export interface Settings {
  eventName: string; year: string; location: string; registrationActive: boolean; votingActive: boolean;
  registrationStartsAt: string | null; registrationEndsAt: string | null; votingStartsAt: string | null; votingEndsAt: string | null; fields: Field[];
}
export interface Category { id: number; name: string; active: number }
export interface Creator { id: number; name: string; handle: string; categoryId: number; category: string; bio: string; photo: string | null; dummy: number }
export interface SocialAccounts { facebook: string; instagram: string; tiktok: string; youtube: string }
export interface RegistrationPayment { provider: string; amount: number; accountNumber: string; accountName: string; demo: boolean }
export interface EventTicket { id: number; number: string; issuedAt: string; checkedInAt: string | null; verificationUrl: string; qrImageUrl: string; pngUrl: string; pdfUrl: string }
export interface AdminCreator extends Creator { votes: number; registrationNumber?: string; ticket?: EventTicket | null; email: string; phone: string; status: 'pending' | 'approved' | 'rejected'; visible: number; review_note: string; answers: Record<string, string | boolean>; fieldSnapshot: Field[]; created_at: string; gender: string; address: string; socialAccounts: SocialAccounts; payment_status: 'not_required' | 'pending' | 'verified' | 'rejected'; paymentSnapshot: Partial<RegistrationPayment>; paymentProofUrl: string | null }
export interface Bootstrap { demoMode?: boolean; mailDeliveryMode?: 'local' | 'smtp'; settings: Settings; categories: Category[]; creators: Creator[]; registrationPayment: RegistrationPayment; votedCategories: { category_id: number; creator_id: number }[]; registrationOpen: boolean; votingOpen: boolean; csrfToken: string; isAdmin: boolean }
export interface Dashboard { settings: Settings; categories: Category[]; creators: AdminCreator[]; stats: { totalVotes: number; totalCreators: number; pendingCreators: number; approvedCreators: number; liveCreators: number; missingPhotos: number; todayVotes: number; voterBrowsers: number }; dailyVotes: { date: string; count: number }[]; audit: { id: number; action: string; detail: string; created_at: string }[]; adminEmail: string; generatedAt: string }
export type Mutation = (path: string, method: string, body: unknown) => Promise<boolean>;
