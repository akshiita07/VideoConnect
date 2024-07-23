// Import the functions you need from the SDKs you need
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.9.4/firebase-app.js';
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, addDoc } from 'https://www.gstatic.com/firebasejs/9.9.4/firebase-firestore.js';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBQnxjuQ6JVj2HQ3B3i1Vxua01zJ-sy-Is",
    authDomain: "videochat-akshita.firebaseapp.com",
    projectId: "videochat-akshita",
    storageBucket: "videochat-akshita.appspot.com",
    messagingSenderId: "345381603726",
    appId: "1:345381603726:web:eab542a8c9d130454afcdf",
    measurementId: "G-3V2NRCQMZ6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

// 3 global states - to share components
// 1. RTC peer connection
const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
    ],
    iceCandidatePoolSize: 10,
};
const pc = new RTCPeerConnection(servers);

// 2. Local and remote streams
let localStream = null; // your cam
let remoteStream = null; // friends cam

// Get elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources
webcamButton.onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    remoteStream = new MediaStream();

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
    });

    // Pull tracks from remote stream, add to video stream
    pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
    };

    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
    // Reference Firestore collections for signaling
    const callDocRef = doc(collection(firestore, 'calls'));
    const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
    const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

    callInput.value = callDocRef.id;

    // Get candidates for caller, save to db
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            addDoc(offerCandidatesRef, event.candidate.toJSON());
        }
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
    };

    await setDoc(callDocRef, { offer });

    // Listen for remote answer
    onSnapshot(callDocRef, (snapshot) => {
        const data = snapshot.data();
        if (data?.answer && !pc.currentRemoteDescription) {
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription);
        }
    });

    // When answered, add candidate to peer connection
    onSnapshot(answerCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
            }
        });
    });

    hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
    const callId = callInput.value;
    const callDocRef = doc(firestore, 'calls', callId);
    const answerCandidatesRef = collection(callDocRef, 'answerCandidates');
    const offerCandidatesRef = collection(callDocRef, 'offerCandidates');

    // Get candidates for answerer, save to db
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            addDoc(answerCandidatesRef, event.candidate.toJSON());
        }
    };

    const callData = (await getDoc(callDocRef)).data();

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
    };

    await updateDoc(callDocRef, { answer });

    // When offered, add candidate to peer connection
    onSnapshot(offerCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
            }
        });
    });
};

// Hangup function
const hangup = () => {
    // Stop all local tracks
    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
    }

    // Close the peer connection
    if (pc) {
        pc.close();
    }

    // Clear the local and remote video streams
    webcamVideo.srcObject = null;
    remoteVideo.srcObject = null;

    // Reset global states
    localStream = null;
    remoteStream = null;

    // Re-enable buttons
    webcamButton.disabled = false;
    callButton.disabled = true;
    answerButton.disabled = true;
    hangupButton.disabled = true;
};

// Attach hangup function to the hangup button
hangupButton.onclick = hangup;
