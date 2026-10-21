// Vai trò người dùng. Giai đoạn 4 chuyển kiểu này sang packages/schema/src/quyen.ts cùng bảng quyền `coQuyen`.
export type VaiTro = 'quan-tri' | 'quan-ly' | 'writer';
export const CAC_VAI_TRO: readonly VaiTro[] = ['quan-tri', 'quan-ly', 'writer'];
