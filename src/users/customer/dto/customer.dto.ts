export class CustomerDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profileImage: string | null;
  address: string | null;
  averageRating: number;
  totalReviews: number;
  status: 'active' | 'inactive' | 'suspended';
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class CustomerPublicDto {
  id: string;
  firstName: string;
  lastName: string;
  profileImage: string | null;
  averageRating: number;
  totalReviews: number;
}
