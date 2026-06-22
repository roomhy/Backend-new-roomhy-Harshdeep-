const mongoose = require('mongoose');

/**
 * Executes a function within a Mongoose transaction session.
 * Automatically falls back to non-transactional execution if the MongoDB deployment
 * does not support transactions (e.g. standalone/development server).
 * 
 * @param {Function} fn - The function to execute. Receives the `session` object.
 * @returns {*} The result of the function.
 */
async function runInTransaction(fn) {
    let session = null;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
        const result = await fn(session);
        await session.commitTransaction();
        session.endSession();
        return result;
    } catch (error) {
        if (session) {
            try {
                if (session.inTransaction()) {
                    await session.abortTransaction();
                }
            } catch (abortError) {
                console.error('Failed to abort transaction:', abortError.message);
            }
            session.endSession();
        }
        
        // Detect if error is because transactions/replica sets are not supported
        const errorMsg = error.message || '';
        const isTxNotSupported = 
            errorMsg.includes('replica set') || 
            errorMsg.includes('transactions') || 
            errorMsg.includes('Session') || 
            errorMsg.includes('transaction') ||
            error.codeName === 'TransactionOutcomeUnknown' ||
            error.code === 20; // IllegalOperation/InvalidSession
            
        if (isTxNotSupported) {
            console.warn('⚠️ MongoDB deployment does not support transactions. Falling back to non-transactional execution.');
            return await fn(null);
        }
        
        throw error;
    }
}

module.exports = {
    runInTransaction
};
