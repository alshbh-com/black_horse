import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  requiredRole?: 'owner' | 'admin' | 'owner_or_admin' | 'courier' | 'office';
}

export default function ProtectedRoute({ children, requiredRole }: Props) {
  const { session, loading, isOwner, isAdmin, isOwnerOrAdmin, isCourier, isOffice } = useAuth();

  const fallbackRoute = (() => {
    if (isOwnerOrAdmin) return '/';
    if (isOffice) return '/office-portal';
    if (isCourier) return '/courier-orders';
    return '/login';
  })();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole === 'owner' && !isOwner) {
    return <Navigate to={fallbackRoute} replace />;
  }

  if (requiredRole === 'admin' && !isAdmin && !isOwner) {
    return <Navigate to={fallbackRoute} replace />;
  }

  if (requiredRole === 'owner_or_admin' && !isOwnerOrAdmin) {
    return <Navigate to={fallbackRoute} replace />;
  }

  if (requiredRole === 'courier') {
    if (!isCourier || isOwnerOrAdmin || isOffice) {
      return <Navigate to={fallbackRoute} replace />;
    }
  }

  if (requiredRole === 'office') {
    if (!isOffice || isOwnerOrAdmin || isCourier) {
      return <Navigate to={fallbackRoute} replace />;
    }
  }

  return <>{children}</>;
}
