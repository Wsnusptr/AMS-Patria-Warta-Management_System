import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Fetch role from Firestore by Email
          try {
            const docRef = doc(db, 'users', user.email.toLowerCase());
            const docSnap = await getDoc(docRef);
            
            console.log("Email Login Saat Ini:", user.email);
            
            if (docSnap.exists()) {
              console.log("Dokumen Ditemukan! Data:", docSnap.data());
              setUserRole(docSnap.data().role);
            } else {
              console.warn("User role not found in Firestore untuk email:", user.email.toLowerCase());
              setUserRole('guest'); // Fallback
            }
          } catch (error) {
          console.error("Error fetching user role:", error);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  const value = {
    currentUser,
    userRole,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
