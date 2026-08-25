import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updatePassword,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    doc,
    setDoc,
    updateDoc,
    serverTimestamp,
    query,
    where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


import { firebaseConfig } from "./firebase-config.js";

// Primary Firebase App Instance
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Secondary Firebase App Instance for Admin User Creation
const secondaryApp = initializeApp(firebaseConfig, "SecondaryAppInstance");
const secondaryAuth = getAuth(secondaryApp);

export async function logActivity(userId, userName, action, details = "") {
    try {
        await addDoc(collection(db, "activity_logs"), {
            userId,
            userName,
            action,
            details,
            timestamp: serverTimestamp(),
        });
    } catch (error) {
        console.error("Failed to record activity log:", error);
    }
}

export async function loginStudent(identifier, password) {
    let emailToUse = identifier.trim();

    // Support login via Student Code (e.g., STU101) or Email
    if (!emailToUse.includes("@")) {
        const usersSnap = await getDocs(
            query(
                collection(db, "users"),
                where("studentId", "==", emailToUse),
            ),
        );
        if (usersSnap.empty) {
            throw new Error("Student Code / ID not found in database.");
        }
        const userDoc = usersSnap.docs[0].data();
        emailToUse = userDoc.email;
    }

    const userCredential = await signInWithEmailAndPassword(
        auth,
        emailToUse,
        password,
    );

    // Retrieve profile details from Firestore
    const usersSnap = await getDocs(
        query(collection(db, "users"), where("email", "==", emailToUse)),
    );
    if (usersSnap.empty) {
        throw new Error("Student profile record not found.");
    }

    const userData = usersSnap.docs[0].data();
    if (userData.active === false) {
        await signOut(auth);
        throw new Error(
            "Your account has been deactivated. Please contact admin.",
        );
    }

    await logActivity(
        userData.studentId,
        userData.name,
        "LOGIN",
        "Student logged in successfully",
    );
    return userData;
}

export async function updateStudentPassword(newPassword) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("No active session found. Please log in again.");
    }
    await updatePassword(user, newPassword);
    await logActivity(
        user.uid,
        user.email,
        "CHANGE_PASSWORD",
        "User updated password",
    );
    return true;
}

export async function createStudentByAdmin(studentId, name, email, password) {
    // Register account in secondary Firebase Auth instance
    const userCred = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password,
    );
    const uid = userCred.user.uid;
    await secondaryAuth.signOut(); // Immediately sign out secondary session

    // Save profile to Firestore
    await setDoc(doc(db, "users", uid), {
        uid,
        studentId,
        name,
        email,
        role: "student",
        active: true,
        createdAt: serverTimestamp(),
    });

    await logActivity(
        "ADMIN",
        "Admin",
        "CREATE_USER",
        `Created student profile: ${name} (${studentId})`,
    );
    return uid;
}

export async function saveTest(testData) {
    await setDoc(
        doc(db, "tests", testData.testId),
        {
            ...testData,
            updatedAt: serverTimestamp(),
        },
        { merge: true },
    );

    await logActivity(
        "ADMIN",
        "Admin",
        "SAVE_TEST",
        `Saved test configuration: ${testData.testId}`,
    );
    return true;
}

export async function bulkUploadQuestions(testId, questionsArray) {
    const batchWrites = questionsArray.map((qData) => {
        const questionId =
            "Q_" + Math.random().toString(36).substring(2, 9).toUpperCase();
        return setDoc(doc(db, "questions", questionId), {
            testId,
            questionId,
            questionData: qData,
            createdAt: serverTimestamp(),
        });
    });

    await Promise.all(batchWrites);

    // Update test question count
    const qSnap = await getDocs(
        query(collection(db, "questions"), where("testId", "==", testId)),
    );
    await updateDoc(doc(db, "tests", testId), {
        totalQuestions: qSnap.size,
    });

    await logActivity(
        "ADMIN",
        "Admin",
        "BULK_UPLOAD_CSV",
        `Uploaded ${questionsArray.length} questions to Test ${testId}`,
    );
    return true;
}

export async function submitExamResult(resultData) {
    const resultId =
        "RES_" + Math.random().toString(36).substring(2, 9).toUpperCase();
    await setDoc(doc(db, "results", resultId), {
        ...resultData,
        resultId,
        timestamp: serverTimestamp(),
    });

    await logActivity(
        resultData.studentId,
        resultData.studentName,
        "SUBMIT_EXAM",
        `Submitted test: ${resultData.testName} (${resultData.score}/${resultData.total})`,
    );
    return resultId;
}

export async function fetchAllTests() {
    const snap = await getDocs(collection(db, "tests"));
    return snap.docs.map((d) => d.data());
}

export async function fetchPublishedTests() {
    const snap = await getDocs(
        query(collection(db, "tests"), where("status", "==", "Published")),
    );
    return snap.docs.map((d) => d.data());
}

export async function fetchQuestionsForTest(testId) {
    const snap = await getDocs(
        query(collection(db, "questions"), where("testId", "==", testId)),
    );
    return snap.docs.map((d) => d.data());
}

export async function fetchAllStudents() {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map((d) => d.data());
}

export async function fetchAllResults() {
    const snap = await getDocs(collection(db, "results"));
    return snap.docs.map((d) => d.data());
}

export async function fetchActivityLogs() {
    const snap = await getDocs(collection(db, "activity_logs"));
    return snap.docs
        .map((d) => d.data())
        .sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeB - timeA;
        });
}
